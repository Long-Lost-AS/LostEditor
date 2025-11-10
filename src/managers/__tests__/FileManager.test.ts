import { beforeEach, describe, expect, it } from "vitest";
import { FileManager } from "../FileManager";

describe("FileManager", () => {
	let fileManager: FileManager;

	beforeEach(() => {
		fileManager = new FileManager();
	});

	describe("setProjectDir and getProjectDir", () => {
		it("should set and get project directory", () => {
			fileManager.setProjectDir("/home/user/project");
			expect(fileManager.getProjectDir()).toBe("/home/user/project");
		});

		it("should return null when project dir not set", () => {
			expect(fileManager.getProjectDir()).toBeNull();
		});

		it("should update project directory when called multiple times", () => {
			fileManager.setProjectDir("/first/project");
			expect(fileManager.getProjectDir()).toBe("/first/project");

			fileManager.setProjectDir("/second/project");
			expect(fileManager.getProjectDir()).toBe("/second/project");
		});

		it("should handle Windows paths", () => {
			fileManager.setProjectDir("C:/Users/test/project");
			expect(fileManager.getProjectDir()).toBe("C:/Users/test/project");
		});
	});

	describe("isAbsolute", () => {
		it("should return true for Unix absolute paths", () => {
			expect(fileManager.isAbsolute("/home/user")).toBe(true);
			expect(fileManager.isAbsolute("/usr/local/bin")).toBe(true);
			expect(fileManager.isAbsolute("/")).toBe(true);
		});

		it("should return true for Windows absolute paths", () => {
			expect(fileManager.isAbsolute("C:/Users")).toBe(true);
			expect(fileManager.isAbsolute("C:\\Users")).toBe(true);
			expect(fileManager.isAbsolute("D:/Program Files")).toBe(true);
		});

		it("should return false for relative paths", () => {
			expect(fileManager.isAbsolute("relative/path")).toBe(false);
			expect(fileManager.isAbsolute("./relative")).toBe(false);
			expect(fileManager.isAbsolute("../parent")).toBe(false);
			expect(fileManager.isAbsolute("file.txt")).toBe(false);
		});

		it("should handle edge cases", () => {
			expect(fileManager.isAbsolute("")).toBe(false);
			expect(fileManager.isAbsolute(".")).toBe(false);
			expect(fileManager.isAbsolute("..")).toBe(false);
		});
	});

	describe("resolvePath", () => {
		it("should throw error when project dir not set", () => {
			expect(() => fileManager.resolvePath("test.txt")).toThrow(
				"Project directory not set. Cannot resolve relative paths.",
			);
		});

		it("should resolve relative path from project dir", () => {
			fileManager.setProjectDir("/home/user/project");
			const result = fileManager.resolvePath("assets/image.png");
			expect(result).toBe("/home/user/project/assets/image.png");
		});

		it("should return absolute path unchanged", () => {
			fileManager.setProjectDir("/home/user/project");
			const result = fileManager.resolvePath("/absolute/path/file.txt");
			expect(result).toBe("/absolute/path/file.txt");
		});

		it("should handle Windows absolute paths", () => {
			fileManager.setProjectDir("C:/Users/test/project");
			const result = fileManager.resolvePath("D:/external/file.txt");
			expect(result).toBe("D:/external/file.txt");
		});

		it("should handle nested relative paths", () => {
			fileManager.setProjectDir("/project");
			const result = fileManager.resolvePath("a/b/c/file.txt");
			expect(result).toBe("/project/a/b/c/file.txt");
		});

		it("should handle empty relative path", () => {
			fileManager.setProjectDir("/project");
			const result = fileManager.resolvePath("");
			expect(result).toBe("/project");
		});
	});

	describe("makeRelative", () => {
		it("should throw error when project dir not set", () => {
			expect(() => fileManager.makeRelative("/some/path/file.txt")).toThrow(
				"Project directory not set. Cannot make path relative.",
			);
		});

		it("should make absolute path relative to project dir", () => {
			fileManager.setProjectDir("/home/user/project");
			const result = fileManager.makeRelative(
				"/home/user/project/assets/image.png",
			);
			expect(result).toBe("assets/image.png");
		});

		it("should handle same directory", () => {
			fileManager.setProjectDir("/home/user/project");
			const result = fileManager.makeRelative("/home/user/project");
			expect(result).toBe("");
		});

		it("should handle path in parent directory", () => {
			fileManager.setProjectDir("/home/user/project");
			const result = fileManager.makeRelative("/home/user/other/file.txt");
			expect(result).toBe("../other/file.txt");
		});

		it("should handle path in nested parent directory", () => {
			fileManager.setProjectDir("/home/user/project/sub");
			const result = fileManager.makeRelative("/home/user/file.txt");
			expect(result).toBe("../../file.txt");
		});

		it("should return already relative paths unchanged", () => {
			fileManager.setProjectDir("/home/user/project");
			const result = fileManager.makeRelative("assets/image.png");
			expect(result).toBe("assets/image.png");
		});
	});

	describe("makeRelativeTo", () => {
		it("should make path relative from specific directory", () => {
			const result = fileManager.makeRelativeTo(
				"/home/user/project",
				"/home/user/project/assets/image.png",
			);
			expect(result).toBe("assets/image.png");
		});

		it("should handle parent directory navigation", () => {
			const result = fileManager.makeRelativeTo(
				"/home/user/project/sub",
				"/home/user/project/file.txt",
			);
			expect(result).toBe("../file.txt");
		});

		it("should handle multiple parent levels", () => {
			const result = fileManager.makeRelativeTo(
				"/home/user/project/a/b/c",
				"/home/user/other/file.txt",
			);
			expect(result).toBe("../../../../other/file.txt");
		});

		it("should return toPath when fromDir is relative", () => {
			const result = fileManager.makeRelativeTo(
				"relative/path",
				"/absolute/path/file.txt",
			);
			expect(result).toBe("/absolute/path/file.txt");
		});

		it("should return toPath unchanged when already relative", () => {
			const result = fileManager.makeRelativeTo(
				"/absolute/dir",
				"relative/file.txt",
			);
			expect(result).toBe("relative/file.txt");
		});

		it("should handle different roots (Windows drives)", () => {
			const result = fileManager.makeRelativeTo(
				"C:/Users/test",
				"D:/Data/file.txt",
			);
			// Different drives should keep absolute path
			expect(result).toBe("D:/Data/file.txt");
		});

		it("should handle same directory", () => {
			const result = fileManager.makeRelativeTo(
				"/home/user/project",
				"/home/user/project/file.txt",
			);
			expect(result).toBe("file.txt");
		});

		it("should handle backslashes in paths", () => {
			const result = fileManager.makeRelativeTo(
				"C:\\Users\\test",
				"C:\\Users\\test\\Documents\\file.txt",
			);
			expect(result).toBe("Documents/file.txt");
		});
	});

	describe("dirname", () => {
		it("should get directory name from Unix path", () => {
			expect(fileManager.dirname("/home/user/file.txt")).toBe("/home/user");
			expect(fileManager.dirname("/home/user/dir/file.txt")).toBe(
				"/home/user/dir",
			);
		});

		it("should get directory name from Windows path", () => {
			expect(fileManager.dirname("C:\\Users\\test\\file.txt")).toBe(
				"C:/Users/test",
			);
		});

		it("should handle root directory", () => {
			expect(fileManager.dirname("/file.txt")).toBe("/");
		});

		it("should return dot for relative path without directory", () => {
			expect(fileManager.dirname("file.txt")).toBe(".");
		});

		it("should handle relative paths with directory", () => {
			expect(fileManager.dirname("dir/file.txt")).toBe("dir");
			expect(fileManager.dirname("a/b/c/file.txt")).toBe("a/b/c");
		});

		it("should handle paths ending with slash", () => {
			expect(fileManager.dirname("/home/user/")).toBe("/home/user");
		});

		it("should handle empty string", () => {
			expect(fileManager.dirname("")).toBe(".");
		});
	});

	describe("basename", () => {
		it("should get base name from Unix path", () => {
			expect(fileManager.basename("/home/user/file.txt")).toBe("file.txt");
			expect(fileManager.basename("/home/user/image.png")).toBe("image.png");
		});

		it("should get base name from Windows path", () => {
			expect(fileManager.basename("C:\\Users\\test\\file.txt")).toBe(
				"file.txt",
			);
		});

		it("should remove extension when provided", () => {
			expect(fileManager.basename("/home/user/file.txt", ".txt")).toBe("file");
			expect(fileManager.basename("image.png", ".png")).toBe("image");
		});

		it("should handle file without directory", () => {
			expect(fileManager.basename("file.txt")).toBe("file.txt");
			expect(fileManager.basename("file.txt", ".txt")).toBe("file");
		});

		it("should handle file without extension", () => {
			expect(fileManager.basename("/home/user/README")).toBe("README");
		});

		it("should handle paths with dots in directory names", () => {
			expect(fileManager.basename("/home/user.name/file.txt")).toBe("file.txt");
		});

		it("should not remove partial extension match", () => {
			expect(fileManager.basename("file.txt", ".tx")).toBe("file.txt");
			// Note: basename('file.txt', 'txt') removes 'txt' from end, leaving 'file.'
			expect(fileManager.basename("file.txt", "txt")).toBe("file.");
		});

		it("should handle empty path", () => {
			expect(fileManager.basename("")).toBe("");
		});
	});

	describe("join", () => {
		it("should join Unix paths", () => {
			expect(fileManager.join("/home", "user", "file.txt")).toBe(
				"/home/user/file.txt",
			);
			expect(fileManager.join("/home/user", "documents", "file.txt")).toBe(
				"/home/user/documents/file.txt",
			);
		});

		it("should join Windows paths", () => {
			expect(fileManager.join("C:\\Users", "test", "file.txt")).toBe(
				"C:/Users/test/file.txt",
			);
		});

		it("should normalize multiple slashes", () => {
			expect(fileManager.join("/home//user", "file.txt")).toBe(
				"/home/user/file.txt",
			);
			expect(fileManager.join("/home/", "/user/", "/file.txt")).toBe(
				"/home/user/file.txt",
			);
		});

		it("should skip empty segments", () => {
			expect(fileManager.join("/home", "", "user", "", "file.txt")).toBe(
				"/home/user/file.txt",
			);
		});

		it("should handle single segment", () => {
			expect(fileManager.join("/home")).toBe("/home");
			expect(fileManager.join("file.txt")).toBe("file.txt");
		});

		it("should handle no segments", () => {
			expect(fileManager.join()).toBe("");
		});

		it("should remove trailing slash", () => {
			expect(fileManager.join("/home", "user/")).toBe("/home/user");
		});

		it("should preserve root slash", () => {
			expect(fileManager.join("/")).toBe("/");
			expect(fileManager.join("/", "home")).toBe("/home");
		});

		it("should handle relative paths", () => {
			expect(fileManager.join("a", "b", "c")).toBe("a/b/c");
			expect(fileManager.join("./a", "./b")).toBe("./a/./b");
		});
	});

	describe("extname", () => {
		it("should get extension from file path", () => {
			expect(fileManager.extname("/home/user/file.txt")).toBe(".txt");
			expect(fileManager.extname("image.png")).toBe(".png");
			expect(fileManager.extname("/home/user/archive.tar.gz")).toBe(".gz");
		});

		it("should return empty string for no extension", () => {
			expect(fileManager.extname("/home/user/README")).toBe("");
			expect(fileManager.extname("file")).toBe("");
		});

		it("should return empty string for dotfile without extension", () => {
			expect(fileManager.extname(".gitignore")).toBe("");
			expect(fileManager.extname(".env")).toBe("");
		});

		it("should handle dotfile with extension", () => {
			expect(fileManager.extname(".config.json")).toBe(".json");
		});

		it("should handle paths with dots in directory names", () => {
			expect(fileManager.extname("/home/user.name/file.txt")).toBe(".txt");
		});

		it("should handle empty path", () => {
			expect(fileManager.extname("")).toBe("");
		});

		it("should handle path ending with dot", () => {
			expect(fileManager.extname("file.")).toBe(".");
		});
	});

	describe("normalize", () => {
		it("should resolve dot segments", () => {
			expect(fileManager.normalize("/home/./user/file.txt")).toBe(
				"/home/user/file.txt",
			);
			expect(fileManager.normalize("/home/user/./file.txt")).toBe(
				"/home/user/file.txt",
			);
		});

		it("should resolve double-dot segments", () => {
			expect(fileManager.normalize("/home/user/../other/file.txt")).toBe(
				"/home/other/file.txt",
			);
			expect(
				fileManager.normalize("/home/user/docs/../../other/file.txt"),
			).toBe("/home/other/file.txt");
		});

		it("should handle relative paths with dot segments", () => {
			expect(fileManager.normalize("a/./b/c")).toBe("a/b/c");
			expect(fileManager.normalize("a/b/../c")).toBe("a/c");
		});

		it("should preserve leading double-dots in relative paths", () => {
			expect(fileManager.normalize("../file.txt")).toBe("../file.txt");
			expect(fileManager.normalize("../../a/b")).toBe("../../a/b");
		});

		it("should handle absolute paths with double-dots beyond root", () => {
			expect(fileManager.normalize("/home/../..")).toBe("/");
			expect(fileManager.normalize("/../home")).toBe("/home");
		});

		it("should normalize backslashes", () => {
			// Note: Windows drive letter colon is preserved
			expect(fileManager.normalize("C:\\Users\\test\\file.txt")).toBe(
				"/C:/Users/test/file.txt",
			);
		});

		it("should handle multiple consecutive slashes", () => {
			expect(fileManager.normalize("/home//user///file.txt")).toBe(
				"/home/user/file.txt",
			);
		});

		it("should return dot for empty or current directory", () => {
			expect(fileManager.normalize("")).toBe(".");
			expect(fileManager.normalize(".")).toBe(".");
			expect(fileManager.normalize("./")).toBe(".");
		});

		it("should handle complex relative paths", () => {
			expect(fileManager.normalize("a/b/c/../../d")).toBe("a/d");
			expect(fileManager.normalize("./a/../b/./c")).toBe("b/c");
		});

		it("should preserve absolute path prefix", () => {
			expect(fileManager.normalize("/a/b")).toBe("/a/b");
			expect(fileManager.normalize("/./a")).toBe("/a");
		});
	});

	describe("integration scenarios", () => {
		it("should handle typical project workflow", () => {
			fileManager.setProjectDir("/home/user/my-project");

			// Resolve relative paths
			const assetPath = fileManager.resolvePath("assets/tileset.png");
			expect(assetPath).toBe("/home/user/my-project/assets/tileset.png");

			// Make paths relative
			const relativePath = fileManager.makeRelative(
				"/home/user/my-project/maps/level1.map",
			);
			expect(relativePath).toBe("maps/level1.map");

			// Get directory and basename
			expect(fileManager.dirname(assetPath)).toBe(
				"/home/user/my-project/assets",
			);
			expect(fileManager.basename(assetPath)).toBe("tileset.png");
			expect(fileManager.extname(assetPath)).toBe(".png");
		});

		it("should handle cross-platform paths", () => {
			// Windows project
			fileManager.setProjectDir("C:/Users/test/project");
			const resolved = fileManager.resolvePath("assets\\tileset.png");
			// Note: join() normalizes backslashes to forward slashes
			expect(resolved).toBe("C:/Users/test/project/assets/tileset.png");
		});

		it("should handle path normalization in workflow", () => {
			fileManager.setProjectDir("/home/user/project");
			const resolved = fileManager.resolvePath("./assets/../images/./file.png");
			const normalized = fileManager.normalize(resolved);
			expect(normalized).toBe("/home/user/project/images/file.png");
		});

		it("should handle external file references", () => {
			fileManager.setProjectDir("/home/user/project");

			// External absolute path should stay absolute
			const external = fileManager.resolvePath("/usr/share/assets/icon.png");
			expect(external).toBe("/usr/share/assets/icon.png");

			// Making external path relative - when no common root, returns absolute
			const relative = fileManager.makeRelative("/usr/share/assets/icon.png");
			expect(relative).toBe("/usr/share/assets/icon.png");
		});

		it("should maintain consistency across operations", () => {
			fileManager.setProjectDir("/home/user/project");

			const original = "/home/user/project/assets/images/sprite.png";
			const relative = fileManager.makeRelative(original);
			const resolved = fileManager.resolvePath(relative);

			// Should round-trip back to original
			expect(resolved).toBe(original);
		});
	});
});
