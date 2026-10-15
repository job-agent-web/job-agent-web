import fs from "node:fs";
import path from "node:path";

export const publicFiles = ["index.html", "auth.html", "auth.js", "app.html", "app.js", "styles.css", "premium.css", "studio.css", "studio.js", "career-studio.svg", "career-hero-blue.png", "admin.html", "admin-local.html", "admin.js", "cv-generator.js", "ai-session-memory.js", "assistant-ai.js", "career-path-library.js", "hosted-account-sync.js", "uk_sponsors.js", "sponsor_websites.js", "app-icon.svg", "app-install.js", "manifest.webmanifest", "sw.js"];

export function preparePublic(root, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const file of publicFiles) {
    let content = fs.readFileSync(path.join(root, file));
    // Preserve existing Windows-1252 source while serving a consistent UTF-8 build.
    if (file === "app.js") content = Buffer.from(new TextDecoder("windows-1252").decode(content), "utf8");
    if (file === "admin.js") {
      let text = content.toString("utf8");
      const replacements = [
        ['var adminFixedPasskey = ["job", "agent"].join("-");', 'var adminFixedPasskey = "";'],
        ['return trim(value) === adminFixedPasskey;', 'return trim(value).length > 0;'],
        ['return adminFixedPasskey;', 'return secret;'],
        ['saveSecret(adminFixedPasskey);', 'saveSecret(secret);'],
        ['var hostedAdminApiBase = "https://jobmatchagent.vercel.app";', 'var hostedAdminApiBase = window.location.origin;']
      ];
      for (const [before, after] of replacements) {
        if (!text.includes(before)) throw new Error("Admin compatibility marker changed: " + before);
        text = text.replace(before, after);
      }
      text = text.replace(/var failover = "Gemini[^\r\n]+;/, 'var failover = "Java provider failover: GPT-OSS, DeepSeek, Gemini, Cloudflare and Hugging Face (feature-dependent order; quota required)";')
        .replaceAll("for 3 cycles", "when available")
        .replaceAll("Netlify GEMINI_API_KEY", "Vercel AI environment variables")
        .replaceAll("GEMINI_API_KEY in Netlify", "AI credentials in Vercel");
      content = Buffer.from(text, "utf8");
    }
    fs.writeFileSync(path.join(destination, file), content);
  }
  fs.copyFileSync(path.join(root, "java-service/public/java-client.js"), path.join(destination, "java-client.js"));
  fs.copyFileSync(path.join(root, "sponsor_websites.json"), path.join(destination, "sponsor_websites.json"));
}
