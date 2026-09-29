import { describe, expect, test } from "bun:test";

const read = (relative: string) => Bun.file(new URL(relative, import.meta.url)).text();

describe("GitHub Actions workflows", () => {
  test("ci.yml runs the four gates", async () => {
    const ci = await read("../.github/workflows/ci.yml");
    for (const job of ["quality:", "test:", "security:", "build:"]) {
      expect(ci).toContain(job);
    }
    expect(ci).toContain("bun run check");
    expect(ci).toContain("bun test --coverage");
    expect(ci).toContain("bun audit");
    expect(ci).toContain("docker build");
    expect(ci).toContain("bun-version: 1.4.2");
  });

  test("image.yml builds and pushes the image to the registry", async () => {
    const image = await read("../.github/workflows/image.yml");
    expect(image).toContain("docker/build-push-action");
    expect(image).toContain("docker/login-action");
    expect(image).toContain("push: ${{ github.event_name != 'pull_request' }}");
    expect(image).toContain("packages: write");
    expect(image).toContain("ghcr.io");
  });

  test("Dockerfile is multi-stage and runs as a non-root user with a healthcheck", async () => {
    const dockerfile = await read("../Dockerfile");
    expect(dockerfile.match(/^FROM /gm)?.length).toBeGreaterThanOrEqual(3);
    expect(dockerfile).toContain("oven/bun:1.4");
    expect(dockerfile).toContain("USER bun");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("/healthz");
  });
});
