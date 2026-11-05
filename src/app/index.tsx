import { useState } from "react";
import { Redirect } from "expo-router";
import { useAuth, useSignIn, useSignUp } from "@clerk/expo";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

type AuthMode = "sign-in" | "sign-up";
type VerificationStep = "form" | "sign-up-code" | "sign-in-code";
type MfaStrategy = "email_code" | "totp";

function getErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const clerkError = error as {
      longMessage?: unknown;
      message?: unknown;
      errors?: { longMessage?: unknown; message?: unknown }[];
    };
    const candidates = [
      clerkError.longMessage,
      clerkError.message,
      ...(Array.isArray(clerkError.errors)
        ? clerkError.errors.flatMap((item) => [item.longMessage, item.message])
        : []),
    ];
    const message = candidates.find(
      (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
    );
    if (message) return message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Clerk could not complete sign-in. Check your credentials and try again.";
}

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [step, setStep] = useState<VerificationStep>("form");
  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy>("email_code");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBusy =
    isSubmitting || signInFetchStatus === "fetching" || signUpFetchStatus === "fetching";

  const showError = (error: unknown) => {
    setFormError(getErrorMessage(error));
  };

  const finishSignIn = async () => {
    const { error } = await signIn.finalize();
    if (error) showError(error);
  };

  const finishSignUp = async () => {
    const { error } = await signUp.finalize();
    if (error) showError(error);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!emailAddress.trim() || !password) {
      setFormError("Enter your email address and password to continue.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === "sign-up") {
        const { error } = await signUp.password({ emailAddress: emailAddress.trim(), password });
        if (error) {
          showError(error);
          return;
        }

        if (signUp.status === "complete") {
          await finishSignUp();
          return;
        }

        const { error: sendCodeError } = await signUp.verifications.sendEmailCode();
        if (sendCodeError) {
          showError(sendCodeError);
          return;
        }
        setStep("sign-up-code");
      } else {
        const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password });
        if (error) {
          showError(error);
          return;
        }

        if (signIn.status === "complete") {
          await finishSignIn();
          return;
        }

        if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
          const factors = signIn.supportedSecondFactors;
          const emailFactor = factors.find((factor) => factor.strategy === "email_code");
          const totpFactor = factors.find((factor) => factor.strategy === "totp");

          if (emailFactor) {
            const { error: sendCodeError } = await signIn.mfa.sendEmailCode();
            if (sendCodeError) {
              showError(sendCodeError);
              return;
            }
            setMfaStrategy("email_code");
            setStep("sign-in-code");
          } else if (totpFactor) {
            setMfaStrategy("totp");
            setStep("sign-in-code");
          } else {
            setFormError("This account needs a verification method this sign-in form does not support.");
          }
          return;
        }

        setFormError("Sign-in needs another step. Check the Clerk sign-in methods enabled for this app.");
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    setFormError(null);
    if (!verificationCode.trim()) {
      setFormError("Enter the verification code to continue.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (step === "sign-up-code") {
        const { error } = await signUp.verifications.verifyEmailCode({ code: verificationCode.trim() });
        if (error) {
          showError(error);
          return;
        }
        if (signUp.status === "complete") {
          await finishSignUp();
        } else {
          setFormError("Your sign-up still needs more information. Check your Clerk sign-up settings.");
        }
      } else {
        const result =
          mfaStrategy === "email_code"
            ? await signIn.mfa.verifyEmailCode({ code: verificationCode.trim() })
            : await signIn.mfa.verifyTOTP({ code: verificationCode.trim() });
        if (result.error) {
          showError(result.error);
          return;
        }
        if (signIn.status === "complete") {
          await finishSignIn();
        } else {
          setFormError("The verification is incomplete. Please check the code and try again.");
        }
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeMode = (nextMode: AuthMode) => {
    signIn.reset();
    signUp.reset();
    setMode(nextMode);
    setStep("form");
    setVerificationCode("");
    setFormError(null);
  };

  if (isLoaded && isSignedIn) return <Redirect href="/dashboard" />;

  return (
    <SafeAreaView className="flex-1 bg-[#F5F5F3]">
      <StatusBar style="auto" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full self-center px-5 py-8 sm:max-w-md">
            <View className="mb-8 items-center">
              <Image
                source={require("../../assets/images/logo.png")}
                className="h-24 w-24"
                resizeMode="contain"
              />
              <Text className="mt-3 text-center text-3xl font-sf-bold tracking-tight text-[#101010]">
                {step === "sign-up-code" ? "Verify your email" : "Budget Buddy"}
              </Text>
              <Text className="mt-3 text-center text-base font-sf text-gray-600">
                {step === "sign-up-code"
                  ? `Enter the code we sent to ${emailAddress.trim()}`
                  : step === "sign-in-code"
                    ? mfaStrategy === "email_code"
                      ? `Enter the sign-in code we sent to ${emailAddress.trim()}`
                      : "Enter the code from your authenticator app"
                    : mode === "sign-in"
                      ? "Sign in to continue to your budget dashboard."
                      : "Create your account and start managing your budget."}
              </Text>
            </View>

            {step === "form" ? (
              <View className="gap-4">
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  className="h-14 rounded-2xl border border-[#E2E1DC] bg-white px-4 text-base text-[#101010]"
                  keyboardType="email-address"
                  onChangeText={setEmailAddress}
                  placeholder="Email address"
                  placeholderTextColor="#777777"
                  textContentType="emailAddress"
                  value={emailAddress}
                />
                <TextInput
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  className="h-14 rounded-2xl border border-[#E2E1DC] bg-white px-4 text-base text-[#101010]"
                  onChangeText={setPassword}
                  onSubmitEditing={handleSubmit}
                  placeholder="Password"
                  placeholderTextColor="#777777"
                  returnKeyType="done"
                  secureTextEntry
                  textContentType={mode === "sign-up" ? "newPassword" : "password"}
                  value={password}
                />
              </View>
            ) : (
              <TextInput
                accessibilityLabel="Verification code"
                autoCapitalize="none"
                autoComplete="one-time-code"
                className="h-14 rounded-2xl border border-[#E2E1DC] bg-white px-4 text-center text-xl tracking-[6px] text-[#101010]"
                keyboardType="number-pad"
                onChangeText={setVerificationCode}
                onSubmitEditing={handleVerify}
                placeholder="Verification code"
                placeholderTextColor="#777777"
                returnKeyType="done"
                textContentType="oneTimeCode"
                value={verificationCode}
              />
            )}

            {formError ? (
              <Text accessibilityLiveRegion="polite" className="mt-4 text-center text-sm text-red-700">
                {formError}
              </Text>
            ) : null}

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.8}
              className="mt-5 h-[58px] items-center justify-center rounded-[20px] bg-blue-500"
              disabled={!isLoaded || isBusy}
              onPress={step === "form" ? handleSubmit : handleVerify}
            >
              {isBusy || !isLoaded ? (
                <ActivityIndicator color="#101010" />
              ) : (
                <Text className="text-base font-sf-bold text-black">
                  {step === "sign-up-code" ? "Verify email" : step === "sign-in-code" ? "Verify code" : mode === "sign-in" ? "Sign in" : "Create account"}
                </Text>
              )}
            </TouchableOpacity>

            {step === "form" ? (
              <TouchableOpacity
                accessibilityRole="button"
                className="mt-5 items-center py-3"
                disabled={isBusy}
                onPress={() => changeMode(mode === "sign-in" ? "sign-up" : "sign-in")}
              >
                <Text className="text-sm font-sf-medium text-gray-600">
                  {mode === "sign-in" ? "New to Budget Buddy? Create an account" : "Already have an account? Sign in"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                className="mt-5 items-center py-3"
                disabled={isBusy}
                onPress={() => {
                  setStep("form");
                  setVerificationCode("");
                  setFormError(null);
                }}
              >
                <Text className="text-sm font-sf-medium text-gray-600">Back to sign in</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
