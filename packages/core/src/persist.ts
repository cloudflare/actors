import { ActorState } from './index';

// Symbol to store persisted property metadata
export const PERSISTED_PROPERTIES = Symbol('PERSISTED_PROPERTIES');

// Symbol to store private values map
export const PERSISTED_VALUES = Symbol('PERSISTED_VALUES');

// Symbol to mark an object as proxied
export const IS_PROXIED = Symbol('IS_PROXIED');

// Type definition for constructor with persisted properties
export type Constructor<T = any> = {
    new (...args: any[]): T;
    [PERSISTED_PROPERTIES]?: Set<string>;
};

/**
 * Creates a deep proxy for objects to track nested property changes
 * @param value The value to potentially proxy
 * @param instance The Actor instance
 * @param propertyKey The top-level property key
 * @param triggerPersist Function to trigger persistence
 * @returns Proxied object if value is an object, otherwise the original value
 */
function createDeepProxy(value: any, instance: any, propertyKey: string, triggerPersist: () => void): any {
    // Don't proxy primitives, functions, or already proxied objects
    if (value === null || 
        value === undefined || 
        typeof value !== 'object' || 
        typeof value === 'function') {
        return value;
    }
    
    // Check if already proxied using a safer approach
    try {
        if (value[IS_PROXIED] === true) {
            return value;
        }
    } catch (e) {
        // If accessing the symbol throws an error, proceed with creating a new proxy
    }
    
    // Handle special cases - don't proxy these types
    if (value instanceof Date || 
        value instanceof RegExp || 
        value instanceof Error || 
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value)) {
        return value;
    }
    
    // Create a proxy to intercept property access and modification
    const proxy = new Proxy(value, {
        get(target, key) {
            // Handle special symbol for proxy detection
            if (key === IS_PROXIED) return true;
            
            // Handle special cases and built-in methods
            if (typeof key === 'symbol' || 
                key === 'toString' || 
                key === 'valueOf' || 
                key === 'constructor' ||
                key === 'toJSON') {
                return Reflect.get(target, key);
            }
            
            try {
                // Check if the property exists
                if (!Reflect.has(target, key)) {
                    // For non-existent properties that are being accessed as objects,
                    // automatically create the object structure
                    // This handles cases like obj.a.b.c where a or b don't exist yet
                    const newObj = {};
                    Reflect.set(target, key, newObj);
                    return createDeepProxy(newObj, instance, propertyKey, triggerPersist);
                }
                
                const prop = Reflect.get(target, key);
                
                // If the property is null or undefined but is being accessed as an object,
                // automatically convert it to an object
                if ((prop === null || prop === undefined) && 
                    typeof key === 'string' && 
                    !key.startsWith('_') && 
                    key !== 'length') {
                    const newObj = {};
                    Reflect.set(target, key, newObj);
                    return createDeepProxy(newObj, instance, propertyKey, triggerPersist);
                }
                
                // If the property is a primitive but is being accessed as an object,
                // we'll return a proxy that will handle the property access and convert
                // it to an object when needed
                if (prop !== null && typeof prop === 'object' && !Object.isFrozen(prop)) {
                    return createDeepProxy(prop, instance, propertyKey, triggerPersist);
                }
                
                return prop;
            } catch (e) {
                console.error(`Error accessing property ${String(key)}:`, e);
                // Return an empty object proxy for error recovery
                const newObj = {};
                Reflect.set(target, key, newObj);
                return createDeepProxy(newObj, instance, propertyKey, triggerPersist);
            }
        },
        set(target, key, newValue) {
            // Don't proxy special symbols
            if (typeof key === 'symbol') {
                Reflect.set(target, key, newValue);
                return true;
            }
            
            try {
                // Get the current value at this key
                const currentValue = Reflect.get(target, key);
                
                // Handle different type transition scenarios
                if (currentValue !== null && 
                    typeof currentValue === 'object' && 
                    newValue !== null && 
                    typeof newValue === 'object' && 
                    !Array.isArray(currentValue) && 
                    !Array.isArray(newValue)) {
                    // Case 1: Both values are objects - merge them instead of replacing
                    Object.assign(currentValue, newValue);
                } else if (newValue !== null && typeof newValue === 'object' && !Object.isFrozen(newValue)) {
                    // Case 2: New value is an object but current value is not (or doesn't exist)
                    // Create a new proxied object
                    const proxiedValue = createDeepProxy(newValue, instance, propertyKey, triggerPersist);
                    Reflect.set(target, key, proxiedValue);
                } else {
                    // Case 3: New value is a primitive (or null) or a frozen object
                    // Simply replace the current value
                    Reflect.set(target, key, newValue);
                }
                
                // Trigger persistence for the entire object
                triggerPersist();
                
                return true;
            } catch (e: unknown) {
                const error = e as Error;
                console.error(`Error setting property ${String(key)}:`, error);
                // If setting the property failed, let's try to recover
                try {
                    // If we're trying to set a property on a non-object, convert to an object first
                    if (error.message && error.message.includes('Cannot create property')) {
                        // Create an empty object and set it
                        const emptyObj = {};
                        Reflect.set(target, key, createDeepProxy(emptyObj, instance, propertyKey, triggerPersist));
                        // Now try setting the property again
                        return true;
                    }
                } catch (recoveryErr) {
                    console.error('Error during recovery attempt:', recoveryErr);
                }
                return false;
            }
        },
        deleteProperty(target, key) {
            try {
                if (Reflect.has(target, key)) {
                    Reflect.deleteProperty(target, key);
                    triggerPersist();
                }
                return true;
            } catch (e) {
                console.error(`Error deleting property ${String(key)}:`, e);
                return false;
            }
        }
    });
    
    return proxy;
}

/**
 * Decorator that marks a property to be persisted in Durable Object storage.
 * When the property value changes, it will be automatically stored in the '_actor_persist' table.
 * Supports deep tracking of nested object properties.
 */
export function Persist<T, V>(target: undefined, context: ClassFieldDecoratorContext<T, V>): void;
export function Persist(target: any, propertyKeyOrContext: string | ClassFieldDecoratorContext<any, any>): void {
    // Handle both decorator formats (legacy and new)
    if (typeof propertyKeyOrContext === 'string') {
        // Legacy decorator format (TS < 5.0)
        const propertyKey = propertyKeyOrContext;
        handleLegacyDecorator(target, propertyKey);
    } else {
        // New decorator format (TS 5.0+)
        const context = propertyKeyOrContext;
        context.addInitializer(function() {
            const instance = this;
            const constructor = Object.getPrototypeOf(instance).constructor as Constructor;
            const propertyKey = context.name.toString();
            
            // Get or initialize the list of persisted properties for this class
            if (!constructor[PERSISTED_PROPERTIES]) {
                constructor[PERSISTED_PROPERTIES] = new Set<string>();
            }
            
            // Add this property to the list of persisted properties
            constructor[PERSISTED_PROPERTIES].add(propertyKey);
            
            // Initialize the persisted values map if it doesn't exist
            if (!(instance as any)[PERSISTED_VALUES]) {
                (instance as any)[PERSISTED_VALUES] = new Map<string, any>();
            }
            
            // Store the initial value from the class definition
            let initialValue = instance[propertyKey];
            
            // Create a function to trigger persistence
            const triggerPersist = () => {
                const currentValue = (instance as any)[PERSISTED_VALUES].get(propertyKey);
                
                // Only persist if the Actor is fully initialized with storage
                if ((instance as any).storage?.raw) {
                    // Store the value in the database
                    (instance as any)._persistProperty(propertyKey, currentValue).catch((err: Error) => {
                        console.error(`Failed to persist property ${propertyKey}:`, err);
                    });
                }
            };
            
            // If the initial value is an object, create a proxy for it
            if (initialValue !== null && typeof initialValue === 'object' && !Array.isArray(initialValue)) {
                initialValue = createDeepProxy(initialValue, instance, propertyKey, triggerPersist);
            }
            
            (instance as any)[PERSISTED_VALUES].set(propertyKey, initialValue);
            
            // Define the property with getter and setter
            Object.defineProperty(instance, propertyKey, {
                get() {
                    return (this as any)[PERSISTED_VALUES].get(propertyKey);
                },
                set(value: any) {
                    // If the new value is an object, create a proxy for it
                    const proxiedValue = (value !== null && typeof value === 'object') 
                        ? createDeepProxy(value, instance, propertyKey, triggerPersist)
                        : value;
                        
                    (this as any)[PERSISTED_VALUES].set(propertyKey, proxiedValue);
                    
                    // Only persist if the Actor is fully initialized with storage
                    if ((this as any).storage?.raw) {
                        // Store the value in the database
                        (this as any)._persistProperty(propertyKey, proxiedValue).catch((err: Error) => {
                            console.error(`Failed to persist property ${propertyKey}:`, err);
                        });
                    }
                },
                enumerable: true,
                configurable: true
            });
        });
    }
}

// Helper function for legacy decorator format
function handleLegacyDecorator(target: any, propertyKey: string): void {
    // Get or initialize the list of persisted properties for this class
    const constructor = target.constructor as Constructor;
    if (!constructor[PERSISTED_PROPERTIES]) {
        constructor[PERSISTED_PROPERTIES] = new Set<string>();
    }
    
    // Add this property to the list of persisted properties
    constructor[PERSISTED_PROPERTIES].add(propertyKey);
    
    // Store the original descriptor
    const originalDescriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
    
    Object.defineProperty(target, propertyKey, {
        get() {
            // Initialize the persisted values map if it doesn't exist
            if (!(this as any)[PERSISTED_VALUES]) {
                (this as any)[PERSISTED_VALUES] = new Map<string, any>();
            }
            return (this as any)[PERSISTED_VALUES].get(propertyKey);
        },
        set(value: any) {
            // Initialize the persisted values map if it doesn't exist
            if (!(this as any)[PERSISTED_VALUES]) {
                (this as any)[PERSISTED_VALUES] = new Map<string, any>();
            }
            
            // Create a function to trigger persistence
            const triggerPersist = () => {
                const currentValue = (this as any)[PERSISTED_VALUES].get(propertyKey);
                
                // Only persist if the Actor is fully initialized with storage
                if ((this as any).storage?.raw) {
                    // Store the value in the database
                    (this as any)._persistProperty(propertyKey, currentValue).catch((err: Error) => {
                        console.error(`Failed to persist property ${propertyKey}:`, err);
                    });
                }
            };
            
            // If the value is an object, create a proxy for it
            const proxiedValue = (value !== null && typeof value === 'object') 
                ? createDeepProxy(value, this, propertyKey, triggerPersist)
                : value;
                
            (this as any)[PERSISTED_VALUES].set(propertyKey, proxiedValue);
            
            // Only persist if the Actor is fully initialized with storage
            if ((this as any).storage?.raw) {
                // Store the value in the database
                (this as any)._persistProperty(propertyKey, proxiedValue).catch((err: Error) => {
                    console.error(`Failed to persist property ${propertyKey}:`, err);
                });
            }
        },
        enumerable: true,
        configurable: true
    });
}

/**
 * Helper function to initialize persisted properties from storage.
 * This is called during Actor construction.
 */
export async function initializePersistedProperties(instance: any): Promise<void> {
    if (!instance.storage?.raw) return;
    
    try {
        // Create the persist table if it doesn't exist
        await instance.storage.__studio({
            type: 'query',
            statement: 'CREATE TABLE IF NOT EXISTS _actor_persist (property TEXT PRIMARY KEY, value TEXT)'
        });
        
        // Get the list of persisted properties for this class
        const constructor = instance.constructor as Constructor;
        const persistedProps = constructor[PERSISTED_PROPERTIES];
        if (!persistedProps || persistedProps.size === 0) return;
        
        // Initialize the persisted values map if it doesn't exist
        if (!instance[PERSISTED_VALUES]) {
            instance[PERSISTED_VALUES] = new Map<string, any>();
        }
        
        // Load all persisted properties from storage
        const results = await instance.storage.__studio({
            type: 'query',
            statement: 'SELECT property, value FROM _actor_persist'
        }) as Array<{property: string, value: string}>;
        
        // Set the properties on the instance
        for (const row of results) {
            if (persistedProps.has(row.property)) {
                try {
                    // Parse the stored value using our safe parser
                    let parsedValue;
                    try {
                        parsedValue = safeParse(row.value);
                        
                        // Handle error objects that were serialized
                        if (parsedValue && parsedValue.__error === 'Serialization failed') {
                            console.warn(`Property ${row.property} had serialization issues: ${parsedValue.value}`);
                            // Use an empty object as fallback for previously failed serializations
                            parsedValue = typeof parsedValue.value === 'string' ? parsedValue.value : {};
                        }
                        
                        // Generic handling for type transitions during initialization
                        // Check if we have an initial value defined on the class
                        const initialValue = instance[row.property];
                        if (initialValue !== undefined && typeof initialValue === 'object' && initialValue !== null) {
                            // If the initial value is an object but the parsed value is not
                            // or if the parsed value is missing expected nested properties
                            if (typeof parsedValue !== 'object' || parsedValue === null) {
                                console.warn(`Property ${row.property} type mismatch: expected object, got ${typeof parsedValue}. Resetting to initial structure.`);
                                // Reset to the initial structure
                                parsedValue = structuredClone(initialValue);
                            } else {
                                // Ensure all expected nested properties exist
                                ensureObjectStructure(parsedValue, initialValue);
                            }
                        }
                    } catch (parseErr) {
                        console.error(`Failed to parse persisted value for ${row.property}:`, parseErr);
                        // Use an empty object as fallback
                        parsedValue = {};
                    }
                    
                    // Helper function to ensure object structure matches expected structure
                    function ensureObjectStructure(target: any, template: any) {
                        if (target === null || typeof target !== 'object' || 
                            template === null || typeof template !== 'object') {
                            return;
                        }
                        
                        // For each property in the template
                        for (const key in template) {
                            // If the template has a nested object
                            if (template[key] !== null && typeof template[key] === 'object') {
                                // If the target doesn't have this property or it's not an object
                                if (!target[key] || typeof target[key] !== 'object') {
                                    // Create the object structure
                                    target[key] = Array.isArray(template[key]) ? [] : {};
                                }
                                // Recursively ensure structure
                                ensureObjectStructure(target[key], template[key]);
                            }
                        }
                    }
                    
                    // Create a function to trigger persistence for this property
                    const triggerPersist = () => {
                        const currentValue = instance[PERSISTED_VALUES].get(row.property);
                        
                        // Only persist if the Actor is fully initialized with storage
                        if (instance.storage?.raw) {
                            // Store the value in the database
                            instance._persistProperty(row.property, currentValue).catch((err: Error) => {
                                console.error(`Failed to persist property ${row.property}:`, err);
                            });
                        }
                    };
                    
                    // If the value is an object, create a proxy for it
                    const proxiedValue = (parsedValue !== null && typeof parsedValue === 'object')
                        ? createDeepProxy(parsedValue, instance, row.property, triggerPersist)
                        : parsedValue;
                    
                    // Store in the values map without triggering the setter
                    instance[PERSISTED_VALUES].set(row.property, proxiedValue);
                } catch (err: any) {
                    console.error(`Failed to process persisted value for ${row.property}:`, err);
                    // Set a default value to prevent further errors
                    instance[PERSISTED_VALUES].set(row.property, {});
                }
            }
        }
    } catch (err: any) {
        console.error('Error initializing persisted properties:', err);
    }
}

/**
 * Helper function for safe JSON serialization that handles circular references
 */
function safeStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
        // Handle special types that don't serialize well
        if (value instanceof Date) {
            return { __type: 'Date', value: value.toISOString() };
        }
        if (value instanceof RegExp) {
            return { __type: 'RegExp', source: value.source, flags: value.flags };
        }
        if (value instanceof Error) {
            return { __type: 'Error', message: value.message, stack: value.stack };
        }
        
        // Handle circular references
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }
        return value;
    });
}

/**
 * Helper function to parse JSON that might contain special type markers
 */
function safeParse(json: string): any {
    return JSON.parse(json, (key, value) => {
        if (value && typeof value === 'object' && value.__type) {
            switch (value.__type) {
                case 'Date':
                    return new Date(value.value);
                case 'RegExp':
                    return new RegExp(value.source, value.flags);
                case 'Error':
                    const error = new Error(value.message);
                    error.stack = value.stack;
                    return error;
            }
        }
        return value;
    });
}

/**
 * Helper function to persist a property value to storage.
 */
export async function persistProperty(instance: any, propertyKey: string, value: any): Promise<void> {
    if (!instance.storage?.raw) return;
    
    try {
        // Get the raw value (unwrap from proxy if needed)
        let rawValue = value;
        
        // Serialize the value to JSON with circular reference handling
        let serializedValue;
        try {
            serializedValue = safeStringify(rawValue);
        } catch (jsonErr) {
            console.error(`Failed to serialize property ${propertyKey}:`, jsonErr);
            // Fallback to a simpler representation
            serializedValue = JSON.stringify({ __error: 'Serialization failed', value: String(rawValue) });
        }
        
        // Store in the database with UPSERT semantics
        await instance.storage.__studio({
            type: 'query',
            statement: 'INSERT INTO _actor_persist (property, value) VALUES (?, ?) ON CONFLICT(property) DO UPDATE SET value = ?',
            params: [propertyKey, serializedValue, serializedValue]
        });
        
        // Call the onPersist hook if it exists
        if (typeof instance.onPersist === 'function') {
            try {
                await instance.onPersist(propertyKey, value);
            } catch (hookErr: any) {
                console.error(`Error in onPersist hook for property ${propertyKey}:`, hookErr);
            }
        }
    } catch (err: any) {
        console.error(`Error persisting property ${propertyKey}:`, err);
        throw err;
    }
}