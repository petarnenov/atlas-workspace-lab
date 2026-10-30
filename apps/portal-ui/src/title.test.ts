import { expect, test } from "vitest";
import { getWorkspaceTitle } from "./title";

test("exports the generic PoC title", () => {
  expect(getWorkspaceTitle()).toBe("Atlas Workspace Lab");
});
