import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import { apiRequest, currentMonthStart } from "../lib/api-client";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

type Expense = { id: string; title: string; amount: number; date: string; category?: string };
type BudgetData = { budget: number; expenses: Expense[] };

const STORAGE_PREFIX = "budget-buddy-dashboard-v1-";
const COLORS = {
  background: "#F5F4EF",
  card: "#FFFFFF",
  ink: "#22221F",
  muted: "#85847E",
  line: "#E9E7E0",
  accent: "#496B52",
};

function readStored(key: string) {
  if (Platform.OS === "web") return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
  return SecureStore.getItemAsync(key);
}

function writeStored(key: string, value: string) {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  }
  return SecureStore.setItemAsync(key, value);
}

function money(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function isThisMonth(date: string) {
  const value = new Date(date);
  const now = new Date();
  return value.getMonth() === now.getMonth() && value.getFullYear() === now.getFullYear();
}

function monthLabel() {
  return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function Dashboard() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const storageKey = `${STORAGE_PREFIX}${userId ?? "guest"}`;
  const [data, setData] = useState<BudgetData | null>(null);
  const [loadedBudgetKey, setLoadedBudgetKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("Food");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accountSyncMessage, setAccountSyncMessage] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const syncedUserIdRef = useRef<string | null>(null);
  const spent = useMemo(() => data?.expenses.filter((item) => isThisMonth(item.date)).reduce((sum, item) => sum + item.amount, 0) ?? 0, [data]);
  const remaining = Math.max(0, (data?.budget ?? 0) - spent);
  const progress = data?.budget ? Math.min(1, spent / data.budget) : 0;
  const isLoadingBudget = loadedBudgetKey !== storageKey;
  const progressValue = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressValue.value * 100}%` }));

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    let cancelled = false;
    const loadBudget = async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session could not be verified. Please sign in again.");
        const month = currentMonthStart();
        const remote = await apiRequest<{ budget: number | null; expenses: Expense[] }>(`/api/budget?month=${month}`, token);
        if (cancelled) return;

        if (remote.budget !== null) {
          setData({ budget: Number(remote.budget), expenses: remote.expenses.map((item) => ({ ...item, amount: Number(item.amount), date: String(item.date) })) });
          return;
        }

        // Bring forward the previous device-only data once, when this month has no Neon budget yet.
        let stored: string | null = null;
        try {
          stored = await readStored(storageKey);
        } catch {
          // Neon is the source of truth; an unavailable device cache does not block loading.
        }
        let local: BudgetData | null = null;
        if (stored) {
          try {
            local = JSON.parse(stored) as BudgetData;
          } catch {
            local = null;
          }
        }
        if (local && Number.isFinite(local.budget) && local.budget > 0 && Array.isArray(local.expenses)) {
          await apiRequest("/api/budget", token, { method: "POST", body: JSON.stringify({ month, budget: local.budget }) });
          const localMonthExpenses = local.expenses.filter((item) => isThisMonth(item.date));
          for (const item of localMonthExpenses) {
            await apiRequest("/api/expenses", token, {
              method: "POST",
              body: JSON.stringify({ ...item, category: item.category ?? "Other", month }),
            });
          }
          if (cancelled) return;
          setData({ budget: local.budget, expenses: localMonthExpenses });
          return;
        }
        setData(null);
      } catch (error) {
        if (!cancelled) setFormError(error instanceof Error ? error.message : "Could not load your budget from Neon.");
      } finally {
        if (!cancelled) setLoadedBudgetKey(storageKey);
      }
    };
    void loadBudget();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, storageKey, userId]);

  useEffect(() => {
    progressValue.value = withTiming(progress, { duration: 650 });
  }, [progress, progressValue]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) {
      syncedUserIdRef.current = null;
      return;
    }
    if (syncedUserIdRef.current === userId) return;
    syncedUserIdRef.current = userId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const syncAccount = async () => {
      setAccountSyncMessage("Saving your account…");
      try {
        const token = await getToken();
        if (!token) throw new Error("Your session could not be verified. Please sign in again.");
        await apiRequest("/api/users", token, { method: "POST" });
        if (!cancelled) {
          setAccountSyncMessage("Account saved.");
          timer = setTimeout(() => { if (!cancelled) setAccountSyncMessage(null); }, 2500);
        }
      } catch (error) {
        if (!cancelled) setAccountSyncMessage(error instanceof Error ? error.message : "Unable to save your account right now.");
      }
    };
    void syncAccount();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [getToken, isLoaded, isSignedIn, userId]);

  const saveData = async (next: BudgetData) => {
    setIsSaving(true);
    setFormError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session could not be verified. Please sign in again.");
      const month = currentMonthStart();
      await apiRequest("/api/budget", token, { method: "POST", body: JSON.stringify({ month, budget: next.budget }) });
      const existingIds = new Set(data?.expenses.map((expense) => expense.id) ?? []);
      for (const expense of next.expenses) {
        if (existingIds.has(expense.id)) continue;
        await apiRequest("/api/expenses", token, { method: "POST", body: JSON.stringify({ ...expense, month }) });
      }
      try {
        await writeStored(storageKey, JSON.stringify(next));
      } catch {
        // Keep the successful Neon write even if the optional device cache is unavailable.
      }
      setData(next);
      return true;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save your changes to Neon. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveBudget = async () => {
    const amount = Number(budgetInput.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a budget amount greater than zero.");
      return;
    }
    await saveData({ budget: amount, expenses: [] });
  };

  const updateBudget = async () => {
    const amount = Number(budgetInput.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a budget amount greater than zero.");
      return;
    }
    if (await saveData({ ...(data as BudgetData), budget: amount })) setShowBudgetForm(false);
  };

  const addExpense = async () => {
    const amount = Number(expenseAmount.replace(/,/g, ""));
    if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError("Add a name and an amount greater than zero.");
      return;
    }
    const next: BudgetData = {
      ...(data as BudgetData),
      expenses: [{ id: `${Date.now()}`, title: expenseTitle.trim(), amount, date: new Date().toISOString(), category: expenseCategory }, ...(data?.expenses ?? [])],
    };
    if (await saveData(next)) {
      setExpenseTitle("");
      setExpenseAmount("");
      setExpenseCategory("Food");
      setShowExpenseForm(false);
    }
  };

  if (!isLoaded || isLoadingBudget) {
    return <View className="flex-1 items-center justify-center bg-[#F3F3F1]"><ActivityIndicator color={COLORS.accent} /></View>;
  }
  if (!isSignedIn) return <Redirect href="/" />;

  const handleSignOut = async () => {
    setSignOutError(null);
    try { await signOut(); }
    catch (error) { setSignOutError(error instanceof Error ? error.message : "Unable to sign out."); }
  };

  if (!data) {
    return (
      <SafeAreaView className="flex-1 bg-[#F3F3F1]" edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInDown.duration(500)}>
              <View className="mb-8 h-14 w-14 items-center justify-center rounded-2xl bg-white"><Text className="text-2xl text-[#496B52]">◷</Text></View>
              <Text className="text-sm font-sf-semibold uppercase tracking-[2px] text-[#85847E]">Daily Budget</Text>
              <Text className="mt-3 text-4xl font-sf-bold leading-[46px] text-[#0E0E10]">How much do you want to track?</Text>
              <Text className="mt-3 text-base leading-6 text-[#85847E]">Set your monthly spending budget. You can change it any time.</Text>
              <View className="mt-9 flex-row items-center rounded-2xl border border-[#E7E7E2] bg-white px-5">
                <Text className="mr-3 text-2xl text-[#85847E]">₹</Text>
                <TextInput accessibilityLabel="Monthly budget amount" className="h-[68px] flex-1 text-2xl font-sf-semibold text-[#0E0E10]" keyboardType="decimal-pad" onChangeText={(value) => { setBudgetInput(value); setFormError(null); }} placeholder="e.g. 30,000" placeholderTextColor="#B7B5AE" returnKeyType="done" value={budgetInput} />
              </View>
              <Text className="mt-3 text-sm text-[#85847E]">Your monthly budget</Text>
              {formError ? <Text accessibilityLiveRegion="polite" className="mt-4 text-sm text-red-700">{formError}</Text> : null}
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} className="mt-8 h-[58px] items-center justify-center rounded-2xl bg-[#0E0E10]" disabled={isSaving} onPress={saveBudget}>
                {isSaving ? <ActivityIndicator color="white" /> : <Text className="text-base font-sf-semibold text-white">Start tracking</Text>}
              </TouchableOpacity>
              {signOutError ? <Text className="mt-4 text-center text-sm text-red-700">{signOutError}</Text> : null}
              <TouchableOpacity accessibilityRole="button" className="mt-5 items-center py-3" onPress={handleSignOut}><Text className="text-sm text-[#85847E]">Sign out</Text></TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const recentExpenses = data.expenses.filter((item) => isThisMonth(item.date)).slice(0, 5);
  const categoryColors: Record<string, string> = { Groceries: "#22C55E", Transport: "#3B82F6", Food: "#F59E0B", Bills: "#8B5CF6", Other: "#EC4899" };
  return (
    <SafeAreaView className="flex-1 bg-[#F5F4EF]" edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} className="mb-7 flex-row items-center justify-between">
            <View><Text className="text-sm font-sf-medium text-[#85847E]">YOUR MONEY, IN FOCUS</Text><Text className="mt-1 text-2xl font-sf-bold text-[#22221F]">Good to see you</Text></View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sign out" className="h-11 w-11 items-center justify-center rounded-full bg-white" onPress={handleSignOut}><Text className="text-lg text-[#496B52]">↗</Text></TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(450)} className="rounded-[28px] bg-[#496B52] p-6">
            <View className="flex-row items-center justify-between"><Text className="text-sm font-sf-medium text-white/75">LEFT TO SPEND</Text><Text className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-sf-medium text-white">{monthLabel()}</Text></View>
            <Text className="mt-4 text-[42px] font-sf-bold tracking-tight text-white">{money(remaining)}</Text>
            <Text className="mt-1 text-sm text-white/75">of {money(data.budget)} monthly budget</Text>
            <View className="mt-6 h-2 overflow-hidden rounded-full bg-white/20"><Animated.View style={progressStyle} className="h-full rounded-full bg-[#D9E4D6]" /></View>
            <View className="mt-3 flex-row justify-between"><Text className="text-xs text-white/75">{money(spent)} spent</Text><Text className="text-xs text-white/75">{Math.round(progress * 100)}% used</Text></View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(450)} className="mt-5 flex-row gap-3">
            <View className="flex-1 rounded-[22px] bg-white p-5"><Text className="text-xs font-sf-medium uppercase tracking-wide text-[#85847E]">Monthly budget</Text><Text className="mt-2 text-xl font-sf-bold text-[#22221F]">{money(data.budget)}</Text></View>
            <View className="flex-1 rounded-[22px] bg-white p-5"><Text className="text-xs font-sf-medium uppercase tracking-wide text-[#85847E]">Spent so far</Text><Text className="mt-2 text-xl font-sf-bold text-[#C98253]">{money(spent)}</Text></View>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(240).duration(450)} className="mt-8 flex-row items-center justify-between">
            <View><Text className="text-xl font-sf-bold text-[#22221F]">Recent spending</Text><Text className="mt-1 text-sm text-[#85847E]">Your latest expenses this month</Text></View>
            <TouchableOpacity accessibilityRole="button" className="rounded-full bg-[#496B52] px-4 py-2.5" onPress={() => { setFormError(null); setShowExpenseForm(true); }}><Text className="text-sm font-sf-semibold text-white">+ Add</Text></TouchableOpacity>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(300).duration(450)} className="mt-4 overflow-hidden rounded-[22px] bg-white px-4">
            {recentExpenses.length === 0 ? (
              <View className="items-center py-9"><View className="mb-3 h-11 w-11 items-center justify-center rounded-[15px] bg-[#F1F1EE]"><Text className="text-lg text-[#496B52]">＋</Text></View><Text className="font-sf-semibold text-[#0E0E10]">Nothing spent yet</Text><Text className="mt-1 text-sm text-[#85847E]">Add your first expense to get started.</Text></View>
            ) : recentExpenses.map((item, index) => {
              const category = item.category ?? "Other";
              const tint = categoryColors[category] ?? categoryColors.Other;
              return (
                <Animated.View key={item.id} entering={FadeInDown.delay(290 + index * 70).duration(350)} className="mb-2 flex-row items-center gap-3 rounded-[18px] border border-[#E7E7E2] px-3 py-[11px]">
                  <View className="h-10 w-10 items-center justify-center rounded-[15px]" style={{ backgroundColor: `${tint}26` }}><Text className="text-lg font-sf-bold" style={{ color: tint }}>{category === "Food" ? "♨" : category === "Transport" ? "▤" : category === "Bills" ? "ϟ" : category === "Groceries" ? "⌑" : "•"}</Text></View>
                  <View className="flex-1"><Text numberOfLines={1} className="text-[15px] font-sf-semibold text-[#0E0E10]">{item.title}</Text><Text className="mt-0.5 text-[12px] text-[#85847E]">{category} · {new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text></View>
                  <Text className="text-[15px] font-sf-bold text-[#0E0E10]">− {money(item.amount)}</Text>
                </Animated.View>
              );
            })}
            {accountSyncMessage ? <Text accessibilityLiveRegion="polite" className="mt-2 text-center text-xs text-[#85847E]">{accountSyncMessage}</Text> : null}
            {signOutError ? <Text accessibilityLiveRegion="polite" className="mt-2 text-center text-sm text-red-700">{signOutError}</Text> : null}
          </Animated.View>
        </ScrollView>
        <View className="h-[72px] flex-row items-center justify-around border-t border-[#E9E7E0] bg-white px-2">
          {[ ["⌂", "Home", true], ["◔", "Insights", false], ["▣", "Sheets", false], ["···", "More", false] ].map(([icon, label, selected]) => (
            <TouchableOpacity key={String(label)} accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} className="min-w-[58px] items-center gap-1" onPress={() => {
              // Tabs are intentionally visual-only until those screens are implemented.
            }}>
              <Text className={`text-[22px] ${selected ? "text-[#496B52]" : "text-[#85847E]"}`}>{icon}</Text><Text className={`text-[11px] font-sf-semibold ${selected ? "text-[#496B52]" : "text-[#85847E]"}`}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Modal animationType="slide" onRequestClose={() => { setShowExpenseForm(false); setShowBudgetForm(false); }} transparent visible={showExpenseForm || showBudgetForm}>
        <View className="flex-1 justify-end bg-black/30"><Pressable accessibilityLabel="Close form" className="flex-1" onPress={() => { setShowExpenseForm(false); setShowBudgetForm(false); }} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View className="rounded-t-[28px] bg-[#F3F3F1] px-6 pb-8 pt-6">
              <View className="mb-6 flex-row items-center justify-between"><View><Text className="text-2xl font-sf-bold text-[#0E0E10]">{showBudgetForm ? "Monthly budget" : "Add expense"}</Text><Text className="mt-1 text-sm text-[#85847E]">{showBudgetForm ? "Adjust your spending limit." : "A quick note is all you need."}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => { setShowExpenseForm(false); setShowBudgetForm(false); }}><Text className="text-2xl text-[#85847E]">×</Text></TouchableOpacity></View>
              {showBudgetForm ? <View className="flex-row items-center rounded-2xl border border-[#E7E7E2] bg-white px-4"><Text className="mr-2 text-lg text-[#85847E]">₹</Text><TextInput accessibilityLabel="Monthly budget amount" className="h-14 flex-1 text-base text-[#0E0E10]" keyboardType="decimal-pad" onChangeText={(value) => { setBudgetInput(value); setFormError(null); }} placeholder="Monthly budget" placeholderTextColor="#9C9A93" returnKeyType="done" value={budgetInput} /></View> : <>
              <TextInput accessibilityLabel="Expense name" autoFocus className="mb-3 h-14 rounded-2xl border border-[#E7E7E2] bg-white px-4 text-base text-[#0E0E10]" onChangeText={(value) => { setExpenseTitle(value); setFormError(null); }} placeholder="What did you spend on?" placeholderTextColor="#9C9A93" value={expenseTitle} />
              <View className="flex-row items-center rounded-2xl border border-[#E7E7E2] bg-white px-4"><Text className="mr-2 text-lg text-[#85847E]">₹</Text><TextInput accessibilityLabel="Expense amount" className="h-14 flex-1 text-base text-[#0E0E10]" keyboardType="decimal-pad" onChangeText={(value) => { setExpenseAmount(value); setFormError(null); }} placeholder="Amount" placeholderTextColor="#9C9A93" returnKeyType="done" value={expenseAmount} /></View>
              <View className="mt-3 flex-row flex-wrap gap-2">{["Food", "Groceries", "Transport", "Bills", "Other"].map((category) => <TouchableOpacity key={category} accessibilityRole="button" accessibilityState={{ selected: expenseCategory === category }} className={`rounded-full px-3 py-2 ${expenseCategory === category ? "bg-[#0E0E10]" : "border border-[#E7E7E2] bg-white"}`} onPress={() => setExpenseCategory(category)}><Text className={`text-xs font-sf-semibold ${expenseCategory === category ? "text-white" : "text-[#85847E]"}`}>{category}</Text></TouchableOpacity>)}</View>
              </>}
              {formError ? <Text accessibilityLiveRegion="polite" className="mt-3 text-sm text-red-700">{formError}</Text> : null}
              <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} className="mt-5 h-[56px] items-center justify-center rounded-2xl bg-[#0E0E10]" disabled={isSaving} onPress={showBudgetForm ? updateBudget : addExpense}>{isSaving ? <ActivityIndicator color="white" /> : <Text className="text-base font-sf-semibold text-white">{showBudgetForm ? "Save budget" : "Save expense"}</Text>}</TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
