import { Actor, ActorConfiguration, handler } from '../../../packages/core/src'

export class MyActor extends Actor<Env> {
    static configuration(request: Request): ActorConfiguration {
        return {
            // Each Actor can have its own Studio configuration
            studio: {
                enabled: true,
                password: 'secret'
            }
        }
    }

    async fetch(request: Request): Promise<Response> {
        return new Response(`Hello, World!`);
    }
}

export default handler(MyActor, {
    // Need to register the Actor classes for our handler to
    // know the class instances exist and call into them for
    // fetching configuration.
    registry: { 
        'MyActor': MyActor 
    },
    studio: {
        // Allows users to reach the Studio entry page
        enabled: true,
        // Visit http://localhost:8788/custom-studio-path to access the studio
        // Optional. By default it will be `/studio`
        // path: '/custom-studio-path'
    }
});