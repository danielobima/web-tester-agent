import { ActionSchema } from "../src/actions";

const testObjectFormat = {
    kind: "fill",
    fields: [
        { ref: "e1", type: "textbox", value: "John" },
        { ref: "e2", value: "john@example.com" } // should default to textbox in logic, but Zod might not set it if I didn't set .default()
    ]
};

const testShorthandFormat = {
    kind: "fill",
    fields: ["e1", "John", "e2", "john@example.com"]
};

try {
    console.log("Testing Object Format...");
    const parsedObj = ActionSchema.parse(testObjectFormat);
    console.log(JSON.stringify(parsedObj, null, 2));

    console.log("\nTesting Shorthand Format...");
    const parsedShort = ActionSchema.parse(testShorthandFormat);
    console.log(JSON.stringify(parsedShort, null, 2));
} catch (e) {
    console.error("Validation failed:", e);
}
