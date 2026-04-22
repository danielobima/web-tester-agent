import { BrowserManager } from "../src/browser";
import { Action, ActionSchema } from "../src/actions";
import * as path from "path";

async function main() {
    const browser = new BrowserManager();
    await browser.init(true); // headless for remote execution

    try {
        const dummyPath = "file://" + path.resolve(__dirname, "../../test/dummy-site.html");
        console.log(`Navigating to ${dummyPath}`);
        
        const navAction: Action = {
            kind: "navigate",
            url: dummyPath
        };
        await browser.execute(navAction);

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get snapshot to see refs
        const snapshot = await browser.getSnapshotForLLM();
        
        const fullNameRef = Object.entries(snapshot.refs).find(([ref, data]: any) => data.name === 'Full Name')?.[0];
        const emailRef = Object.entries(snapshot.refs).find(([ref, data]: any) => data.name === 'Email Address')?.[0];

        if (!fullNameRef || !emailRef) {
            console.error("Could not find refs for fields");
            console.log("Refs available:", snapshot.refs);
            return;
        }

        console.log(`Found Full Name ref: ${fullNameRef}, Email ref: ${emailRef}`);

        const fillActionRaw = {
            kind: "fill",
            fields: [fullNameRef, "Jane Doe", emailRef, "jane@example.com"]
        };

        console.log("Parsing action through Zod...");
        const fillAction = ActionSchema.parse(fillActionRaw);

        console.log("Executing shorthand fill...");
        await browser.execute(fillAction);

        // Take a screenshot to verify
        const screenshotPath = path.resolve(__dirname, "../../artifacts/test-fill-result.png");
        await browser.page?.screenshot({ path: screenshotPath });
        console.log(`Screenshot saved to ${screenshotPath}`);

    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await browser.close();
    }
}

main();
