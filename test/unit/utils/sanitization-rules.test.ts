import {describe, expect, it} from "vitest";

// Test cases for sanitization rules
export const testCases = {
    project: [
        {input: "My Project", expected: "My-Project"}, // Preserves case
        {input: "test@app!", expected: "test-app"},
        {input: "-start-dash", expected: "start-dash"},
        {input: "@myorg/package", expected: "package"},
        {input: "my-project", expected: "my-project"},
        {input: "project_name", expected: "project_name"},
        {input: "project123", expected: "project123"},
        {input: "my   project", expected: "my-project"},
        {input: "my.project", expected: "my-project"},
        {input: "---project---", expected: "project"},
        {input: "my----awesome----project", expected: "my-awesome-project"},
        {input: "@#$%", expected: "project"},
        {input: "123project", expected: "p-123project"},
        {input: "1-my-project", expected: "p-1-my-project"},
        {input: "@myorg", expected: "myorg"},
    ],
    gitBranch: [
        {input: "feature test", expected: "feature-test"}, // Spaces replaced with hyphens
        {input: "bug#123", expected: "bug#123"}, // # is allowed in git branches
        {input: "feat/[ui]", expected: "feat/ui"}, // [] removed
        {input: "feature-branch", expected: "feature-branch"},
        {input: "feature/new", expected: "feature/new"},
        {input: "bugfix-123", expected: "bugfix-123"},
        {input: "release-1.0.0", expected: "release-1.0.0"},
        {input: ".branch", expected: "branch"},
        {input: "branch.", expected: "branch"},
        {input: "feature..branch", expected: "feature-branch"},
        {input: "branch.lock", expected: "branch"},
        {input: "feature~test", expected: "featuretest"}, // ~ removed
        {input: "branch^name", expected: "branchname"}, // ^ removed
        {input: "test:branch", expected: "testbranch"}, // : removed
        {input: "name?test", expected: "nametest"}, // ? removed
        {input: "branch*name", expected: "branchname"}, // * removed
        {input: "test[branch]", expected: "testbranch"}, // [] removed
        {input: "name\\test", expected: "nametest"}, // \ removed
    ],
    tmux: [
        {input: "my.session", expected: "my-session"},
        {input: "work:project", expected: "work-project"},
        {input: "My Session", expected: "my-session"},
        {input: "123session", expected: "session"},
        {input: "work_project", expected: "work_project"},
    ],
};

describe("Sanitization Rules Documentation", () => {
    it("should have documented test cases", () => {
        // This test ensures our test cases are defined
        expect(testCases.project.length).toBeGreaterThan(0);
        expect(testCases.gitBranch.length).toBeGreaterThan(0);
        expect(testCases.tmux.length).toBeGreaterThan(0);
    });
});
