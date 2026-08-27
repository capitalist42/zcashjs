import { describe, expect, it } from "vitest";
import { NodeGrpcLightwalletdTransport } from "../src/index.js";

describe("NodeGrpcLightwalletdTransport", () => {
  it("constructs and closes without connecting", () => {
    const transport = new NodeGrpcLightwalletdTransport("127.0.0.1:1");
    expect(transport.endpoint).toBe("127.0.0.1:1"); transport.close();
  });
});
