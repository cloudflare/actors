import { ActorState } from './index';

// Symbol to store persisted property metadata
export const PERSISTED_PROPERTIES = Symbol('PERSISTED_PROPERTIES');

// Symbol to store private values map
export const PERSISTED_VALUES = Symbol('PERSISTED_VALUES');

// Type definition for constructor with persisted properties
export type Constructor<T = any> = {
    new (...args: any[]): T;
    [PERSISTED_PROPERTIES]?: Set<string>;
};

/**
 * Decorator that marks a property to be persisted in Durable Object storage.
 * When the property value changes, it will be automatically stored in the '_actor_persist' table.
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
            const initialValue = instance[propertyKey];
            (instance as any)[PERSISTED_VALUES].set(propertyKey, initialValue);
            
            // Define the property with getter and setter
            Object.defineProperty(instance, propertyKey, {
                get() {
                    return (this as any)[PERSISTED_VALUES].get(propertyKey);
                },
                set(value: any) {
                    (this as any)[PERSISTED_VALUES].set(propertyKey, value);
                    
                    // Only persist if the Actor is fully initialized with storage
                    if ((this as any).storage?.raw) {
                        // Store the value in the database
                        (this as any)._persistProperty(propertyKey, value).catch((err: Error) => {
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
            (this as any)[PERSISTED_VALUES].set(propertyKey, value);
            
            // Only persist if the Actor is fully initialized with storage
            if ((this as any).storage?.raw) {
                // Store the value in the database
                (this as any)._persistProperty(propertyKey, value).catch((err: Error) => {
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
        
        // Load all persisted properties from storage
        const results = await instance.storage.__studio({
            type: 'query',
            statement: 'SELECT property, value FROM _actor_persist'
        }) as Array<{property: string, value: string}>;
        
        // Set the properties on the instance
        for (const row of results) {
            if (persistedProps.has(row.property)) {
                try {
                    // Parse the stored value
                    const parsedValue = JSON.parse(row.value);
                    
                    // Store in the values map without triggering the setter
                    instance[PERSISTED_VALUES].set(row.property, parsedValue);
                } catch (err: any) {
                    console.error(`Failed to parse persisted value for ${row.property}:`, err);
                }
            }
        }
    } catch (err: any) {
        console.error('Error initializing persisted properties:', err);
    }
}

/**
 * Helper function to persist a property value to storage.
 */
export async function persistProperty(instance: any, propertyKey: string, value: any): Promise<void> {
    if (!instance.storage?.raw) return;
    
    try {
        // Serialize the value to JSON
        const serializedValue = JSON.stringify(value);
        
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