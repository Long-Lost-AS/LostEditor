import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
								plugins: [react()],
								test: {
																globals: true,
																environment: "jsdom",
																setupFiles: ["./src/test-setup.ts"],
																include: ["src/**/*.{test,spec}.{ts,tsx}"],
																coverage: {
																								provider: "v8",
																								reporter: ["text", "json", "html", "lcov"],
																								exclude: [
																																"node_modules/",
																																"src/test-setup.ts",
																																"src/**/*.test.{ts,tsx}",
																																"src/**/*.spec.{ts,tsx}",
																																"src/**/__tests__/**",
																																"src/**/__mocks__/**",
																																"src/**/__fixtures__/**",
																								],
																								all: true,
																								thresholds: {
																																lines: 98.77,
																																functions: 98.82,
																																branches: 99.12,
																																statements: 98.83,
																																autoUpdate: true,
																								},
																},
								},
								resolve: {
																alias: {
																								"@": path.resolve(__dirname, "./src"),
																},
								},
});