import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { ClerkLoaded, ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { useFonts } from "expo-font";

SplashScreen.preventAutoHideAsync();
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
const requiredPublishableKey = (() => {
  if (!publishableKey) {
    throw new Error("Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable");
  }
  return publishableKey;
})();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    "SF-Pro-Regular": require("../../assets/fonts/SF-Pro-Text-Regular.otf"),
    "SF-Pro-Medium": require("../../assets/fonts/SF-Pro-Text-Medium.otf"),
    "SF-Pro-Semibold": require("../../assets/fonts/SF-Pro-Text-Semibold.otf"),
    "SF-Pro-Bold": require("../../assets/fonts/SF-Pro-Text-Bold.otf"),
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <ClerkProvider publishableKey={requiredPublishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="dashboard" />
        </Stack>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
