export type DimensionId = "overworld" | "nether";
export const isDimensionId = (value: unknown): value is DimensionId => value === "overworld" || value === "nether";
