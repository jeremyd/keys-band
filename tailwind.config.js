/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.svelte", "./public/index.html"],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      "light",
      "dark",
      "cupcake",
      "lofi",
      "forest",
      "synthwave",
      "halloween",
      "black",
      "luxury",
      "autumn",
    ],
  },
};
