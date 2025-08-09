import {ConflictInfo} from "../../../src/types/conflicts";

describe("Conflict Types", () => {
    it("should create valid ConflictInfo objects", () => {
        const conflict: ConflictInfo = {
            type: "active",
            files: ["file1.txt"],
            count: 1,
        };
        expect(conflict.type).toBe("active");
        expect(conflict.files).toEqual(["file1.txt"]);
        expect(conflict.count).toBe(1);
    });

    it("should create conflict with details", () => {
        const conflict: ConflictInfo = {
            type: "potential",
            files: ["file1.txt", "file2.txt"],
            count: 2,
            details: {
                bothModified: 1,
                bothAdded: 0,
                bothDeleted: 0,
                addedByUs: 1,
                addedByThem: 0,
                deletedByUs: 0,
                deletedByThem: 0,
            },
        };
        expect(conflict.type).toBe("potential");
        expect(conflict.details?.bothModified).toBe(1);
        expect(conflict.details?.addedByUs).toBe(1);
    });
});
