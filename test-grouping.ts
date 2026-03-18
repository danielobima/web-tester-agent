function groupSnapshotInputs(snapshot: string): string {
  const lines = snapshot.split("\\n");
  const result: string[] = [];
  
  const INPUT_ROLES = new Set(["textbox", "checkbox", "radio", "combobox", "listbox", "spinbutton", "slider"]);
  
  // To know if we are inside a form/group, we track the ancestor chain
  const stack: { indent: number, role: string, name: string }[] = [];
  
  let currentGroup: { indent: number, name: string, lines: string[] } | null = null;
  let activeHeading: { indent: number, name: string } | null = null;
  
  const flushGroup = () => {
    if (currentGroup) {
      if (currentGroup.lines.some(l => INPUT_ROLES.has(l.match(/^\\s*-\\s*([a-zA-Z]+)/)?.[1] || ""))) {
        const indentStr = " ".repeat(currentGroup.indent * 2);
        result.push(\`\${indentStr}- group "\${currentGroup.name || 'Form Inputs'}"\`);
        for (const gl of currentGroup.lines) {
          result.push(\`  \${gl}\`); // increase indent by 1 level (2 spaces)
        }
      } else {
        for (const gl of currentGroup.lines) {
          result.push(gl);
        }
      }
      currentGroup = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const indentMatch = line.match(/^(\\s*)/);
    const indent = indentMatch ? Math.floor(indentMatch[1].length / 2) : 0;
    
    // Update stack
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    
    // Parse role and name
    const roleMatch = line.match(/^\\s*-\\s*([a-zA-Z]+)(?:\\s+"([^"]+)")?/);
    const textMatch = line.match(/^\\s*-\\s*text:\\s+"([^"]+)"/);
    
    const role = roleMatch ? roleMatch[1] : (textMatch ? "text" : "unknown");
    const name = roleMatch ? (roleMatch[2] || "") : (textMatch ? textMatch[1] : "");
    
    if (role !== "text" && role !== "unknown") {
      stack.push({ indent, role, name });
    }
    
    if (role === "heading") {
      activeHeading = { indent, name };
    }
    
    // Clear activeHeading if we outdent past it
    if (activeHeading && indent <= activeHeading.indent && role !== "heading") {
      activeHeading = null;
    }
    
    const inFormOrGroup = stack.some(s => s.role === "form" || s.role === "group");
    const isInput = INPUT_ROLES.has(role);
    const isText = role === "text";
    
    if (inFormOrGroup) {
      flushGroup();
      result.push(line);
      continue;
    }
    
    if (isInput || isText) {
      // Start or continue a group
      if (!currentGroup) {
        // Find a suitable name from recent heading
        const groupName = activeHeading ? activeHeading.name : "Form Inputs";
        currentGroup = { indent, name: groupName, lines: [line] };
      } else {
        // If indent drops below group indent, start a new group?
        // Usually, text and input are at similar indent. 
        if (indent < currentGroup.indent) {
          flushGroup();
          const groupName = activeHeading ? activeHeading.name : "Form Inputs";
          currentGroup = { indent, name: groupName, lines: [line] };
        } else {
          currentGroup.lines.push(line);
        }
      }
    } else {
      flushGroup();
      result.push(line);
    }
  }
  
  flushGroup();
  return result.join("\\n");
}

const input = \`
- document
  - heading "Billing Address"
  - text: "First Name"
  - textbox "First Name" [ref=e2]
  - textbox "Last Name" [ref=e3]
  - link "What is this?"
  - heading "Shipping Address"
  - textbox "City" [ref=e4]
  - textbox "Zip" [ref=e5]
  - form "Payment"
    - textbox "Card" [ref=e6]
\`;

console.log(groupSnapshotInputs(input.trim()));
