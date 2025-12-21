/**
 * Context for tracking actor invocations across the call chain
 */
interface ActorInvocationContext {
  actorName: string;
  actorClass: string;
}

/**
 * Simple async context storage for tracking actor invocation chains.
 * This uses a module-level variable to track the current execution context.
 */
let currentContext: ActorInvocationContext | undefined;

function getContext(): ActorInvocationContext | undefined {
  return currentContext;
}

function setContext(context: ActorInvocationContext | undefined): void {
  currentContext = context;
}

function runInContext<T>(context: ActorInvocationContext, fn: () => T): T {
  const previousContext = currentContext;
  currentContext = context;
  try {
    return fn();
  } finally {
    currentContext = previousContext;
  }
}

/**
 * Observability class for tracking actor interactions and invocations
 */
export class Observability<T> {
  private actor: T;

  constructor(actor: T) {
    this.actor = actor;
  }

  /**
   * Log an object to the console
   */
  log(obj: object): void {
    console.log(obj);
  }

  /**
   * Log an actor invocation event showing parent-child relationships
   */
  logInvocation(parentActor: string, parentClass: string, childActor: string, childClass: string): void {
    this.log({
      type: 'actor_invocation',
      timestamp: new Date().toISOString(),
      parent: {
        actor: parentActor,
        class: parentClass
      },
      child: {
        actor: childActor,
        class: childClass
      }
    });
  }

  /**
   * Get the current actor invocation context
   */
  static getContext(): ActorInvocationContext | undefined {
    return getContext();
  }

  /**
   * Set the current actor invocation context
   */
  static setContext(context: ActorInvocationContext | undefined): void {
    setContext(context);
  }

  /**
   * Run a function within a specific actor invocation context
   */
  static run<R>(context: ActorInvocationContext, fn: () => R): R {
    return runInContext(context, fn);
  }
}
