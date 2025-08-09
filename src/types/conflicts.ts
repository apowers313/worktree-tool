export interface ConflictInfo {
    type: "active" | "potential";
    files: string[];
    count: number;
    details?: ConflictDetails;
}

export interface ConflictDetails {
    bothModified: number;
    bothAdded: number;
    bothDeleted: number;
    addedByUs: number;
    addedByThem: number;
    deletedByUs: number;
    deletedByThem: number;
}

export interface ConflictDetectionResult {
    active?: ConflictInfo;
    potential?: ConflictInfo;
}
