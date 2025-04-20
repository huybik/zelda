/* File: src/core/profiler.ts */
interface ProfileRecord {
  startTime: number;
  label: string;
}

interface ProfileData {
  totalTime: number;
  calls: number;
  selfTime: number; // Time spent ONLY in this function, excluding children
  children: Map<string, ProfileData>; // Store child data keyed by label
}

export class Profiler {
  // Use a single root map to store top-level calls
  private rootChildren: Map<string, ProfileData> = new Map();
  private stack: ProfileRecord[] = [];
  public isEnabled: boolean = true; // Allow enabling/disabling

  constructor() {
    // No explicit root node needed, rootChildren holds the top level
  }

  // Helper to get/create a node within a specific children map
  private getOrCreateDataNode(
    childrenMap: Map<string, ProfileData>,
    label: string
  ): ProfileData {
    if (!childrenMap.has(label)) {
      const newNode: ProfileData = {
        totalTime: 0,
        calls: 0,
        selfTime: 0, // Will be calculated later
        children: new Map(), // Initialize children map here
      };
      childrenMap.set(label, newNode);
    }
    return childrenMap.get(label)!;
  }

  start(label: string): void {
    if (!this.isEnabled) return;
    const startTime = performance.now();
    this.stack.push({ startTime, label });
  }

  end(label: string): void {
    if (!this.isEnabled || this.stack.length === 0) return;

    const endTime = performance.now();
    // Peek at the top record *before* potentially popping
    const currentRecordOnStack = this.stack[this.stack.length - 1];

    if (currentRecordOnStack.label !== label) {
      console.error(
        `Profiler stack error: end('${label}') called, but expected end('${currentRecordOnStack.label}'). Stack: [${this.stack.map((r) => r.label).join(", ")}]`
      );
      // Attempt recovery: Pop until we find the expected label or empty the stack
      let recoveryAttempts = 0;
      while (
        this.stack.length > 0 &&
        this.stack[this.stack.length - 1].label !== label &&
        recoveryAttempts < 10
      ) {
        const mismatched = this.stack.pop();
        console.warn(`Popped mismatched profiler record: ${mismatched?.label}`);
        recoveryAttempts++;
      }
      // If we still don't find it or the stack is empty, disable and exit
      if (
        this.stack.length === 0 ||
        this.stack[this.stack.length - 1].label !== label
      ) {
        console.error("Cannot recover profiler stack. Disabling profiler.");
        this.isEnabled = false;
        this.stack = []; // Clear stack
        return;
      }
      console.warn(`Profiler stack recovered after ${recoveryAttempts} pops.`);
    }

    // Now pop the correct record
    const currentRecord = this.stack.pop()!; // We know it matches now (or we recovered/returned)
    const duration = endTime - currentRecord.startTime;

    // Determine the map where the current node's data should reside
    let targetChildrenMap: Map<string, ProfileData>;

    if (this.stack.length > 0) {
      // We have a parent on the stack. Find the parent's node data.
      let currentMap = this.rootChildren;
      let parentNode: ProfileData | undefined = undefined;

      // Traverse stack *up to the parent level* (stack.length is now parent's depth)
      for (let i = 0; i < this.stack.length; i++) {
        const nodeLabel = this.stack[i].label;
        // Get or create the node at this level *if it doesn't exist*
        // This handles cases where the parent might have been created during error recovery
        const node = this.getOrCreateDataNode(currentMap, nodeLabel);

        if (i === this.stack.length - 1) {
          // This is the immediate parent node
          parentNode = node;
        } else {
          // Go deeper for the next iteration
          currentMap = node.children;
        }
      }

      if (!parentNode) {
        // This case should also not happen if stack.length > 0 and recovery worked
        console.error(
          `Profiler error: Could not locate parent node structure for '${label}' despite non-empty stack.`
        );
        this.isEnabled = false; // Disable to prevent further errors
        this.stack = [];
        return;
      }
      targetChildrenMap = parentNode.children;
    } else {
      // No parent on stack, this is a top-level call. Store in rootChildren.
      targetChildrenMap = this.rootChildren;
    }

    // Get or create the data node for the current label within the correct parent's children map
    const dataNode = this.getOrCreateDataNode(targetChildrenMap, label);

    dataNode.calls++;
    dataNode.totalTime += duration;
    // selfTime is calculated during report generation
  }

  reset(): void {
    this.rootChildren.clear(); // Clear the root's children
    this.stack = [];
    console.log("Profiler data reset.");
  }

  getReport(): string {
    if (!this.isEnabled) return "Profiler is disabled.";

    let report = "--- Profiler Report ---\n";
    report +=
      "Label".padEnd(45) +
      "Calls".padStart(10) +
      "Total (ms)".padStart(15) +
      "Self (ms)".padStart(15) +
      "Avg (ms)".padStart(15) +
      "\n";
    report += "-".repeat(100) + "\n";

    const reportLines: string[] = [];

    // Recursive helper function to process nodes and build report lines
    const processNodeAndChildren = (
      node: ProfileData,
      label: string,
      depth: number
    ): number => {
      let childrenTotalTime = 0;
      const sortedChildren = Array.from(node.children.entries()).sort(
        ([, a], [, b]) => b.totalTime - a.totalTime
      );

      // Store child lines temporarily to add them *after* the parent line
      const childReportLines: string[] = [];
      for (const [childLabel, childNode] of sortedChildren) {
        // Recursively process child, calculate its total time, and get its report lines
        childrenTotalTime += processNodeInternal(
          childNode,
          childLabel,
          depth + 1,
          childReportLines
        );
      }

      // Calculate self time for the current node
      const selfTime = Math.max(0, node.totalTime - childrenTotalTime);
      node.selfTime = selfTime; // Store calculated selfTime
      const avgTime = node.calls > 0 ? node.totalTime / node.calls : 0;

      // Format the line for the current node
      const indentedLabel = ("  ".repeat(depth) + label).padEnd(45);
      const paddedCalls = node.calls.toString().padStart(10);
      const paddedTotal = node.totalTime.toFixed(3).padStart(15);
      const paddedSelf = node.selfTime.toFixed(3).padStart(15); // Use calculated selfTime
      const paddedAvg = avgTime.toFixed(3).padStart(15);

      // Add the current node's line to the main report lines
      reportLines.push(
        `${indentedLabel}${paddedCalls}${paddedTotal}${paddedSelf}${paddedAvg}`
      );
      // Add the collected child lines after the parent
      reportLines.push(...childReportLines);

      return node.totalTime; // Return total time for parent calculation
    };

    // Inner helper to avoid modifying reportLines directly in recursion, collecting lines instead
    const processNodeInternal = (
      node: ProfileData,
      label: string,
      depth: number,
      collectedLines: string[]
    ): number => {
      let childrenTotalTime = 0;
      const sortedChildren = Array.from(node.children.entries()).sort(
        ([, a], [, b]) => b.totalTime - a.totalTime
      );

      const childReportLines: string[] = [];
      for (const [childLabel, childNode] of sortedChildren) {
        childrenTotalTime += processNodeInternal(
          childNode,
          childLabel,
          depth + 1,
          childReportLines
        );
      }

      const selfTime = Math.max(0, node.totalTime - childrenTotalTime);
      node.selfTime = selfTime;
      const avgTime = node.calls > 0 ? node.totalTime / node.calls : 0;

      const indentedLabel = ("  ".repeat(depth) + label).padEnd(45);
      const paddedCalls = node.calls.toString().padStart(10);
      const paddedTotal = node.totalTime.toFixed(3).padStart(15);
      const paddedSelf = node.selfTime.toFixed(3).padStart(15);
      const paddedAvg = avgTime.toFixed(3).padStart(15);

      // Add current node line and its children lines to the collection for this branch
      collectedLines.push(
        `${indentedLabel}${paddedCalls}${paddedTotal}${paddedSelf}${paddedAvg}`
      );
      collectedLines.push(...childReportLines);

      return node.totalTime;
    };

    // Process top-level nodes stored under the root
    const sortedRootChildren = Array.from(this.rootChildren.entries()).sort(
      ([, a], [, b]) => b.totalTime - a.totalTime
    );
    for (const [label, node] of sortedRootChildren) {
      processNodeAndChildren(node, label, 0); // Start recursion from depth 0
    }

    report += reportLines.join("\n") + "\n";
    report += "-----------------------\n";
    return report;
  }

  toggle(enable?: boolean): void {
    this.isEnabled = enable === undefined ? !this.isEnabled : enable;
    console.log(`Profiler ${this.isEnabled ? "enabled" : "disabled"}.`);
    if (!this.isEnabled) {
      // Clear stack if disabled to prevent mismatches on re-enable
      this.stack = [];
    }
  }
}
