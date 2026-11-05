/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ["SF-Pro-Regular"],
        sf: ["SF-Pro-Regular"],
        "sf-regular": ["SF-Pro-Regular"],
        "sf-medium": ["SF-Pro-Medium"],
        "sf-semibold": ["SF-Pro-Semibold"],
        "sf-bold": ["SF-Pro-Bold"],
      },
    },
  },
  plugins: [],
};
