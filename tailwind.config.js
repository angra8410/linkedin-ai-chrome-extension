/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        linkedin: {
          blue: "#0A66C2",
          dark: "#004182",
          light: "#EBF3FB",
        },
      },
    },
  },
  plugins: [],
};