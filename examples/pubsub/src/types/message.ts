export type MessagePayload = {
    // Idempotent message ID that uniquely identifies this message
    messageId: string;
    // Which topic this message should be directed to
    topic: string;
    // Customizable payload provided by the user
    payload: Record<string, any>;
}