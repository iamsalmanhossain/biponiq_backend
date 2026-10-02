export const getSwaggerHtml = (swaggerDocument: any): string => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>API Docs</title>
      <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui.css" />
      <style>
        html { box-sizing: border-box; }
        *, *:before, *:after { box-sizing: inherit; }
        body { 
          margin: 0; 
          background-color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          transition: background-color 0.4s ease;
        }

        /* --- Professional Theme Toggle Switch --- */
        .theme-switch-wrapper {
          position: fixed;
          bottom: 30px;
          right: 30px;
          z-index: 9999;
          display: flex;
          align-items: center;
          background: #ffffff;
          padding: 10px 18px;
          border-radius: 50px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          border: 1px solid #eaeaea;
        }
        .theme-switch-text {
          margin-right: 12px; font-size: 14px; font-weight: 600; color: #444;
        }
        .theme-switch {
          display: inline-block; height: 26px; position: relative; width: 50px;
        }
        .theme-switch input { display: none; }
        .slider {
          background-color: #dcdcdc; bottom: 0; cursor: pointer; left: 0;
          position: absolute; right: 0; top: 0; transition: .4s; border-radius: 34px;
        }
        .slider:before {
          background-color: #ffffff; bottom: 3px; content: ""; height: 20px;
          left: 4px; position: absolute; transition: .4s; width: 20px; border-radius: 50%;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        input:checked + .slider { background-color: #2b2b2b; }
        input:checked + .slider:before { transform: translateX(22px); }

        /* --- DARK MODE GLOBAL LOGIC --- */
        body.dark-mode {
          background-color: #121212;
        }
        body.dark-mode .theme-switch-wrapper {
          background: #1e1e1e; border-color: #333; box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        }
        body.dark-mode .theme-switch-text { color: #f1f1f1; }
        
        /* Master Invert for the entire Swagger UI */
        body.dark-mode .swagger-ui {
          filter: invert(92%) hue-rotate(180deg) brightness(0.95) contrast(0.95);
        }
        
        /* Fixing Syntax Highlights, Images, and SVGs so they don't break */
        body.dark-mode .swagger-ui img,
        body.dark-mode .swagger-ui svg,
        body.dark-mode .swagger-ui .highlight-code {
          filter: invert(100%) hue-rotate(180deg);
        }

        /* --- 🛠️ FIX FOR THE GREY BACKGROUNDS (Servers & Search Box) --- */
        /* Force them to be White by default, so the Dark Mode filter properly turns them Dark! */
        .swagger-ui .scheme-container,
        .swagger-ui .filter .operation-filter-input {
          background-color: #ffffff !important;
        }

        /* Better Search Bar UI Formatting */
        .swagger-ui .filter .operation-filter-input {
          border: 2px solid #4990e2;
          border-radius: 8px;
          padding: 10px 16px;
          margin-bottom: 20px;
          outline: none;
          color: #333 !important; /* Text color */
        }
      </style>
    </head>
    <body>
      
      <div class="theme-switch-wrapper">
        <span class="theme-switch-text" id="theme-text">Light Mode</span>
        <label class="theme-switch" for="checkbox">
          <input type="checkbox" id="checkbox" />
          <div class="slider"></div>
        </label>
      </div>

      <div id="swagger-ui"></div>
      
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-bundle.js"> </script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis
            ],
            layout: "BaseLayout",
            spec: ${JSON.stringify(swaggerDocument)}
          });
          window.ui = ui;

          // --- Theme Toggle Logic ---
          const toggleSwitch = document.querySelector('.theme-switch input[type="checkbox"]');
          const themeText = document.getElementById('theme-text');
          const body = document.body;

          const savedTheme = localStorage.getItem('swagger-theme');
          const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
          
          const enableDarkMode = () => {
            body.classList.add('dark-mode');
            themeText.textContent = 'Dark Mode';
            toggleSwitch.checked = true;
            localStorage.setItem('swagger-theme', 'dark');
          };

          const enableLightMode = () => {
            body.classList.remove('dark-mode');
            themeText.textContent = 'Light Mode';
            toggleSwitch.checked = false;
            localStorage.setItem('swagger-theme', 'light');
          };

          if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
            enableDarkMode();
          }

          toggleSwitch.addEventListener('change', function(e) {
            if (e.target.checked) enableDarkMode();
            else enableLightMode();
          });
        };
      </script>
    </body>
    </html>
  `;
};