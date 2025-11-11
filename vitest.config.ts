import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

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
																																lines: 99.29,
																																functions: 98.85,
																																branches: 97.98,
																																statements: 98.91,
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