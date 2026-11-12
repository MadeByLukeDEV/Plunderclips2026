import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNext("/dashboard/accounts")).toBe("/dashboard/accounts");
  });
  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "evil", ""])(
    "rejects %s",
    (v) => {
      expect(safeNext(v)).toBe("/dashboard");
    },
  );
  it("uses the first value of a repeated param", () => {
    expect(safeNext(["/a", "/b"])).toBe("/a");
  });
});
