/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef5ff", 100: "#d9e8ff", 200: "#bcd7ff", 300: "#8ebeff",
          400: "#5999ff", 500: "#3375fc", 600: "#1d56f1", 700: "#1642de",
          800: "#1936b4", 900: "#1a338e", 950: "#152156",
        },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
