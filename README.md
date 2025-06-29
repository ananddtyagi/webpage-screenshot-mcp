# Webpage Screenshot MCP Server

An MCP (Model Context Protocol) server that captures screenshots of web pages using Puppeteer. This server allows AI agents to visually verify web applications and see their progress when generating web apps.

![Screen Recording May 27 2025 (2)](https://github.com/user-attachments/assets/9f186ec4-5a5c-449b-9a30-a5ec0cdba695)


## Features

- **Full page screenshots**: Capture entire web pages or just the viewport
- **Element screenshots**: Target specific elements using CSS selectors
- **Multiple formats**: Support for PNG, JPEG, and WebP formats
- **Customizable options**: Set viewport size, image quality, wait conditions, and delays
- **Base64 encoding**: Returns screenshots as base64 encoded images for easy integration
- **Authentication support**: Manual login and cookie persistence
- **Default browser integration**: Use your system's default browser for a more natural experience
- **Session persistence**: Keep browser sessions open for multi-step workflows

## Installation

### Quick Start (Claude Desktop Extension)

For the fastest setup with Claude Desktop, simply drag and drop the `screenshot-webpage-mcp.dxt` file into Claude Desktop. The extension will be automatically installed and ready to use!

### Manual Installation

To install and build the MCP from source:

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/ananddtyagi/webpage-screenshot-mcp.git
cd webpage-screenshot-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

The MCP server is built using TypeScript and compiled to JavaScript. The `dist` folder contains the compiled JavaScript files. 

### Adding to Claude or Cursor

To add this MCP to Claude Desktop or Cursor:

1. **Claude Desktop**:
   - Go to Settings > Developer
   - Click "Edit Config"
   - Add the following:

   ```json
    "webpage-screenshot": {
      "command": "node",
      "args": [
        "~/path/to/webpage-screenshot-mcp/dist/index.js"
      ]
    }
   ```
   - Save and reload Claude

2. **Cursor**:
   - Open Cursor and go to Cursor Settings > MCP
   - Click "Add new global MCP server"
   - Add the following:
  
  ```json
    "webpage-screenshot": {
      "command": "node",
      "args": ["~/path/to/webpage-screenshot-mcp/dist/index.js"]
    }
   ```

   - Save and reload Cursor

## Usage

### Tools

This MCP server provides several tools:

#### 1. login-and-wait

Opens a webpage in a visible browser window for manual login, waits for user to complete login, then saves cookies.

```json
{
  "url": "https://example.com/login",
  "waitMinutes": 5,
  "successIndicator": ".dashboard-welcome",
  "useDefaultBrowser": true
}
```

- `url` (required): The URL of the login page
- `waitMinutes` (optional): Maximum minutes to wait for login (default: 5)
- `successIndicator` (optional): CSS selector or URL pattern that indicates successful login
- `useDefaultBrowser` (optional): Whether to use the system's default browser (default: true)

#### 2. screenshot-page

Captures a screenshot of a given URL and returns it as base64 encoded image.

```json
{
  "url": "https://example.com/dashboard",
  "fullPage": true,
  "width": 1920,
  "height": 1080,
  "format": "png",
  "quality": 80,
  "waitFor": "networkidle2",
  "delay": 500,
  "useSavedAuth": true,
  "reuseAuthPage": true,
  "useDefaultBrowser": true,
  "visibleBrowser": true
}
```

- `url` (required): The URL of the webpage to screenshot
- `fullPage` (optional): Whether to capture the full page or just the viewport (default: true)
- `width` (optional): Viewport width in pixels (default: 1920)
- `height` (optional): Viewport height in pixels (default: 1080)
- `format` (optional): Image format - "png", "jpeg", or "webp" (default: "png")
- `quality` (optional): Quality of the image (0-100), only applicable for jpeg and webp
- `waitFor` (optional): When to consider page loaded - "load", "domcontentloaded", "networkidle0", or "networkidle2" (default: "networkidle2")
- `delay` (optional): Additional delay in milliseconds after page load (default: 0)
- `useSavedAuth` (optional): Whether to use saved cookies from previous login (default: true)
- `reuseAuthPage` (optional): Whether to use the existing authenticated page (default: false)
- `useDefaultBrowser` (optional): Whether to use the system's default browser (default: false)
- `visibleBrowser` (optional): Whether to show the browser window (default: false)

#### 3. screenshot-element

Captures a screenshot of a specific element on a webpage using a CSS selector.

```json
{
  "url": "https://example.com/dashboard",
  "selector": ".user-profile",
  "waitForSelector": true,
  "format": "png",
  "quality": 80,
  "padding": 10,
  "useSavedAuth": true,
  "useDefaultBrowser": true,
  "visibleBrowser": true
}
```

- `url` (required): The URL of the webpage
- `selector` (required): CSS selector for the element to screenshot
- `waitForSelector` (optional): Whether to wait for the selector to appear (default: true)
- `format` (optional): Image format - "png", "jpeg", or "webp" (default: "png")
- `quality` (optional): Quality of the image (0-100), only applicable for jpeg and webp
- `padding` (optional): Padding around the element in pixels (default: 0)
- `useSavedAuth` (optional): Whether to use saved cookies from previous login (default: true)
- `useDefaultBrowser` (optional): Whether to use the system's default browser (default: false)
- `visibleBrowser` (optional): Whether to show the browser window (default: false)

#### 4. clear-auth-cookies

Clears saved authentication cookies for a specific domain or all domains.

```json
{
  "url": "https://example.com"
}
```

- `url` (optional): URL of the domain to clear cookies for. If not provided, clears all cookies.

## Default Browser Mode

The default browser mode allows you to use your system's regular browser (Chrome, Edge, etc.) instead of Puppeteer's bundled Chromium. This is useful for:

1. Using your existing browser sessions and extensions
2. Manually logging in to websites with your saved credentials
3. Having a more natural browsing experience for multi-step workflows
4. Testing with the same browser environment as your users

To enable default browser mode, set `useDefaultBrowser: true` and `visibleBrowser: true` in your tool parameters.

### How Default Browser Mode Works

When you enable default browser mode:

1. The tool will attempt to locate your system's default browser (Chrome, Edge, etc.)
2. It launches your browser with remote debugging enabled on a random port
3. Puppeteer connects to this browser instance instead of launching its own
4. Your existing profiles, extensions, and cookies are available during the session
5. The browser window remains visible so you can interact with it manually

This mode is particularly useful for workflows that require authentication or complex user interactions.

## Browser Persistence

The MCP server can maintain a persistent browser session across multiple tool calls:

1. When you use `login-and-wait`, the browser session is kept open
2. Subsequent calls to `screenshot-page` or `screenshot-element` with `reuseAuthPage: true` will use the same page
3. This allows for multi-step workflows without having to re-authenticate

## Cookie Management

Cookies are automatically saved for each domain you visit:

1. After using `login-and-wait`, cookies are saved to the `.mcp-screenshot-cookies` directory in your home folder
2. These cookies are automatically loaded when visiting the same domain again with `useSavedAuth: true`
3. You can clear cookies using the `clear-auth-cookies` tool

## Example Workflow: Protected Page Screenshots

Here's an example workflow for taking screenshots of pages that require authentication:

1. **Manual Login Phase**

```json
{
  "name": "login-and-wait",
  "parameters": {
    "url": "https://example.com/login",
    "waitMinutes": 3,
    "successIndicator": ".dashboard-welcome",
    "useDefaultBrowser": true
  }
}
```

This will open your default browser with the login page. You can manually log in, and once complete (either by detecting the success indicator or after navigating away from the login page), the session cookies will be saved.

2. **Take Screenshots Using Saved Session**

```json
{
  "name": "screenshot-page",
  "parameters": {
    "url": "https://example.com/account",
    "fullPage": true,
    "useSavedAuth": true,
    "reuseAuthPage": true,
    "useDefaultBrowser": true,
    "visibleBrowser": true
  }
}
```

This will take a screenshot of the account page using your saved authentication cookies in the same browser window.

3. **Take Screenshots of Specific Elements**

```json
{
  "name": "screenshot-element",
  "parameters": {
    "url": "https://example.com/dashboard",
    "selector": ".user-profile-section",
    "useSavedAuth": true,
    "useDefaultBrowser": true,
    "visibleBrowser": true
  }
}
```

4. **Clear Cookies When Done**

```json
{
  "name": "clear-auth-cookies",
  "parameters": {
    "url": "https://example.com"
  }
}
```

This workflow allows you to interact with protected pages as if you were a regular user, completing the full authentication flow in your default browser.

## Headless vs. Visible Mode

- **Headless mode** (`visibleBrowser: false`): Faster and more suitable for automated workflows where no user interaction is needed.
- **Visible mode** (`visibleBrowser: true`): Shows the browser window, allowing for user interaction and manual verification. Required for `useDefaultBrowser: true`.

## Platform Support

The default browser detection works on:

- **macOS**: Detects Chrome, Edge, and Safari
- **Windows**: Detects Chrome and Edge via registry or common installation paths
- **Linux**: Detects Chrome and Chromium via system commands

## Troubleshooting

### Common Issues

1. **Default browser not found**: If the system can't find your default browser, it will fall back to Puppeteer's bundled Chromium.
2. **Connection issues**: If there are problems connecting to the browser's debugging port, check if another instance is already using that port.
3. **Cookie issues**: If authentication isn't working, try clearing cookies with the `clear-auth-cookies` tool.

### Debugging

The MCP server logs helpful error messages to the console when issues occur. Check these messages for troubleshooting information.
