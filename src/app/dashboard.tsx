import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/expo";
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
import Svg, { Circle, G } from "react-native-svg";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Car,
  FileSpreadsheet,
  Gift,
  Home,
  IndianRupee,
  LogOut,
  Moon,
  MoreHorizontal,
  PencilLine,
  PieChart,
  Plus,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  Utensils,
  Wallet,
  X,
  Zap,
} from "lucide-react-native";

type TransactionType = "expense" | "income";
type Expense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  category?: string;
  type?: TransactionType;
};
type BudgetData = { budget: number; expenses: Expense[] };
type Period = "Week" | "Month" | "Year";

const EXPENSE_CATEGORIES = ["Food", "Groceries", "Transport", "Bills", "Other"] as const;
const INCOME_CATEGORIES = ["Salary", "Freelance", "Gift", "Refund", "Other"] as const;

const CATEGORY_ICONS: Record<string, typeof Utensils> = {
  Food: Utensils,
  Groceries: ShoppingBag,
  Transport: Car,
  Bills: Zap,
  Salary: TrendingUp,
  Freelance: ArrowDownLeft,
  Gift: Gift,
  Refund: RefreshCw,
  Income: ArrowDownLeft,
  Other: Tag,
};

const INSIGHTS_COLORS: Record<string, string> = {
  Food: "#F59E0B",
  Groceries: "#10B981",
  Transport: "#38BDF8",
  Bills: "#8B5CF6",
  Salary: "#059669",
  Freelance: "#0D9488",
  Gift: "#F43F5E",
  Refund: "#06B6D4",
  Other: "#A1A1AA",
};
const FALLBACK_COLORS = ["#F59E0B", "#10B981", "#38BDF8", "#8B5CF6", "#F43F5E", "#0D9488", "#06B6D4", "#A1A1AA"];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good evening";
}

function money(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function isThisMonth(date: string) {
  const value = new Date(date);
  const now = new Date();
  return value.getMonth() === now.getMonth() && value.getFullYear() === now.getFullYear();
}

function isIncomeTransaction(item: Expense): boolean {
  return (
    item.type === "income" ||
    item.category === "Income" ||
    item.category === "Salary" ||
    item.category === "Freelance" ||
    item.category === "Gift" ||
    item.category === "Refund"
  );
}

function monthLabel() {
  return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatExpenseDate(isoDate: string) {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Dashboard() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();

  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const activeTab = selectedTab ?? (params.tab === "insights" ? "Insights" : "Home");
  const setActiveTab = (tab: string) => setSelectedTab(tab);

  const [data, setData] = useState<BudgetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Insights state
  const [period, setPeriod] = useState<Period>("Month");

  // Modal form states: budget, add-transaction, or edit-transaction
  const [modalType, setModalType] = useState<"budget" | "add-transaction" | "edit-transaction" | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<string>("Food");

  // Current month transactions
  const currentMonthTransactions = useMemo(
    () => data?.expenses.filter((item) => isThisMonth(item.date)) ?? [],
    [data],
  );

  const spent = useMemo(
    () =>
      currentMonthTransactions
        .filter((item) => !isIncomeTransaction(item))
        .reduce((sum, item) => sum + item.amount, 0),
    [currentMonthTransactions],
  );

  const received = useMemo(
    () =>
      currentMonthTransactions
        .filter((item) => isIncomeTransaction(item))
        .reduce((sum, item) => sum + item.amount, 0),
    [currentMonthTransactions],
  );

  const totalAllowance = (data?.budget ?? 0) + received;
  const remaining = Math.max(0, totalAllowance - spent);
  const progress = totalAllowance > 0 ? Math.min(1, spent / totalAllowance) : 0;

  // Animated progress bar
  const progressValue = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressValue.value * 100}%` }));

  useEffect(() => {
    progressValue.value = withTiming(progress, { duration: 550 });
  }, [progress, progressValue]);

  // Load budget & transactions from Neon
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    const fetchBudget = async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Session could not be verified. Please sign in again.");

        const res = await apiRequest<{ budget: number | null; expenses: Expense[] }>(
          `/api/budget?month=${currentMonthStart()}`,
          token,
        );
        if (cancelled) return;

        if (res.budget !== null) {
          setData({
            budget: Number(res.budget),
            expenses: res.expenses.map((e) => ({
              ...e,
              amount: Number(e.amount),
              date: String(e.date),
              type: e.type || (isIncomeTransaction(e) ? "income" : "expense"),
            })),
          });
        } else {
          setData(null);
        }
      } catch (error) {
        if (!cancelled) {
          setFormError(error instanceof Error ? error.message : "Failed to load budget from Neon.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchBudget();
    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  // Save budget to Neon
  const handleSaveBudget = async () => {
    const amount = Number(budgetInput.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a valid budget amount greater than zero.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required.");

      await apiRequest("/api/budget", token, {
        method: "POST",
        body: JSON.stringify({ month: currentMonthStart(), budget: amount }),
      });

      setData((prev) => ({ budget: amount, expenses: prev?.expenses ?? [] }));
      setBudgetInput("");
      setModalType(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save budget.");
    } finally {
      setIsSaving(false);
    }
  };

  // Add new transaction
  const handleAddTransaction = async () => {
    const amount = Number(expenseAmount.replace(/,/g, ""));
    if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a name and an amount greater than zero.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    const newTransaction: Expense = {
      id: `${Date.now()}`,
      title: expenseTitle.trim(),
      amount,
      category: expenseCategory,
      type: transactionType,
      date: new Date().toISOString(),
    };

    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required.");

      await apiRequest("/api/expenses", token, {
        method: "POST",
        body: JSON.stringify({ ...newTransaction, month: currentMonthStart() }),
      });

      setData((prev) => (prev ? { ...prev, expenses: [newTransaction, ...prev.expenses] } : null));
      setExpenseTitle("");
      setExpenseAmount("");
      setModalType(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  // Open modal to edit existing transaction
  const handleOpenEditTransaction = (item: Expense) => {
    const isInc = isIncomeTransaction(item);
    setEditingExpenseId(item.id);
    setTransactionType(isInc ? "income" : "expense");
    setExpenseTitle(item.title);
    setExpenseAmount(String(item.amount));
    setExpenseCategory(item.category || (isInc ? "Salary" : "Food"));
    setFormError(null);
    setModalType("edit-transaction");
  };

  // Update existing transaction
  const handleUpdateTransaction = async () => {
    if (!editingExpenseId) return;
    const amount = Number(expenseAmount.replace(/,/g, ""));
    if (!expenseTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a name and an amount greater than zero.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required.");

      await apiRequest("/api/expenses", token, {
        method: "PUT",
        body: JSON.stringify({
          id: editingExpenseId,
          title: expenseTitle.trim(),
          amount,
          category: expenseCategory,
          type: transactionType,
        }),
      });

      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          expenses: prev.expenses.map((item) =>
            item.id === editingExpenseId
              ? {
                  ...item,
                  title: expenseTitle.trim(),
                  amount,
                  category: expenseCategory,
                  type: transactionType,
                }
              : item,
          ),
        };
      });

      setModalType(null);
      setEditingExpenseId(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to update transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete transaction
  const handleDeleteTransaction = async () => {
    if (!editingExpenseId) return;

    setIsSaving(true);
    setFormError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Authentication required.");

      await apiRequest(`/api/expenses?id=${encodeURIComponent(editingExpenseId)}`, token, {
        method: "DELETE",
      });

      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          expenses: prev.expenses.filter((item) => item.id !== editingExpenseId),
        };
      });

      setModalType(null);
      setEditingExpenseId(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to delete transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  // Aesthetic minimal theme tokens
  const bgMain = isDarkMode ? "bg-[#0C0D10]" : "bg-[#FBFBFA]";
  const bgCard = isDarkMode ? "bg-[#14151B]" : "bg-white";
  const borderCard = isDarkMode ? "border-zinc-800/80" : "border-zinc-200/60";
  const textPrimary = isDarkMode ? "text-zinc-100" : "text-zinc-900";
  const textMuted = isDarkMode ? "text-zinc-400" : "text-zinc-500";
  const iconMuted = isDarkMode ? "#A1A1AA" : "#71717A";
  const itemIconBg = isDarkMode ? "bg-zinc-800/80" : "bg-zinc-100";
  const itemIconColor = isDarkMode ? "#E4E4E7" : "#3F3F46";

  // Insights Calculations (Instant & in-memory)
  const insightsData = useMemo(() => {
    const allExpenses = data?.expenses.filter((item) => !isIncomeTransaction(item)) ?? [];
    const now = new Date();

    let scoped = allExpenses;
    let budgetFactor = 1;

    if (period === "Week") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      scoped = allExpenses.filter((item) => new Date(item.date) >= sevenDaysAgo);
      budgetFactor = 7 / 30;
    } else if (period === "Month") {
      scoped = allExpenses.filter((item) => isThisMonth(item.date));
      budgetFactor = 1;
    } else if (period === "Year") {
      scoped = allExpenses.filter((item) => new Date(item.date).getFullYear() === now.getFullYear());
      budgetFactor = 12;
    }

    const total = scoped.reduce((sum, item) => sum + item.amount, 0);
    const scopedBudget = Math.round((data?.budget ?? 0) * budgetFactor);
    const pct = scopedBudget > 0 ? Math.min(100, Math.round((total / scopedBudget) * 100)) : 0;

    // Category breakdown
    const categoryMap = new Map<string, number>();
    scoped.forEach((item) => {
      const cat = item.category || "Other";
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + item.amount);
    });
    const categories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount], index) => {
        const color = INSIGHTS_COLORS[name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
        return {
          name,
          amount,
          color,
          pct: total > 0 ? Math.round((amount / total) * 100) : 0,
        };
      });

    // Donut chart slices calculation (pure & immutable)
    const circumference = 2 * Math.PI * 68; // radius 68 -> ~427.256
    const slices = categories.map((cat, idx) => {
      const accumulatedRatio = categories
        .slice(0, idx)
        .reduce((sum, item) => sum + (total > 0 ? item.amount / total : 0), 0);
      const ratio = total > 0 ? cat.amount / total : 0;
      const strokeDash = ratio * circumference;
      const strokeGap = circumference - strokeDash;
      const strokeOffset = -(accumulatedRatio * circumference);
      return {
        ...cat,
        strokeDasharray: `${Math.max(0, strokeDash - (categories.length > 1 ? 3 : 0))} ${strokeGap + (categories.length > 1 ? 3 : 0)}`,
        strokeDashoffset: strokeOffset,
      };
    });

    return { total, scopedBudget, pct, categories, slices, count: scoped.length };
  }, [data, period]);

  if (!isLoaded || isLoading) {
    return (
      <View className={`flex-1 items-center justify-center ${bgMain}`}>
        <ActivityIndicator color={isDarkMode ? "#E4E4E7" : "#18181B"} />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/" />;

  // Onboarding View (no budget configured yet)
  if (!data) {
    return (
      <SafeAreaView className={`flex-1 ${bgMain}`} edges={["top", "bottom"]}>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeInDown.duration(450)}>
              <View className="mb-8 flex-row items-center justify-between">
                <View
                  className={`h-12 w-12 items-center justify-center rounded-2xl border ${borderCard} ${bgCard}`}
                >
                  <Wallet size={22} color={isDarkMode ? "#FAFAFA" : "#18181B"} strokeWidth={1.8} />
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Dark Mode"
                  className={`h-10 w-10 items-center justify-center rounded-full border ${borderCard} ${bgCard}`}
                  onPress={() => setIsDarkMode((prev) => !prev)}
                >
                  {isDarkMode ? <Sun size={17} color={iconMuted} /> : <Moon size={17} color={iconMuted} />}
                </TouchableOpacity>
              </View>

              <Text className={`text-3xl font-sf-bold tracking-tight ${textPrimary}`}>
                {getGreeting()}
              </Text>
              <Text className={`mt-2 text-base font-sf-regular leading-6 ${textMuted}`}>
                Set your monthly spending budget to begin.
              </Text>

              <View
                className={`mt-7 flex-row items-center rounded-2xl border ${borderCard} ${bgCard} px-4 shadow-sm`}
              >
                <IndianRupee size={20} color={isDarkMode ? "#71717A" : "#A1A1AA"} strokeWidth={1.8} />
                <TextInput
                  accessibilityLabel="Monthly budget amount"
                  className={`h-16 flex-1 pl-3 text-xl font-sf-semibold ${textPrimary}`}
                  keyboardType="decimal-pad"
                  onChangeText={(val) => {
                    setBudgetInput(val);
                    setFormError(null);
                  }}
                  placeholder="30,000"
                  placeholderTextColor={isDarkMode ? "#52525B" : "#A1A1AA"}
                  returnKeyType="done"
                  value={budgetInput}
                />
              </View>

              {formError ? (
                <Text accessibilityLiveRegion="polite" className="mt-3.5 text-sm font-sf-medium text-red-500">
                  {formError}
                </Text>
              ) : null}

              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.88}
                className={`mt-6 h-[54px] items-center justify-center rounded-2xl ${
                  isDarkMode ? "bg-white" : "bg-zinc-900"
                }`}
                disabled={isSaving}
                onPress={handleSaveBudget}
              >
                {isSaving ? (
                  <ActivityIndicator color={isDarkMode ? "#18181B" : "#FFFFFF"} />
                ) : (
                  <Text
                    className={`text-base font-sf-semibold ${
                      isDarkMode ? "text-zinc-900" : "text-white"
                    }`}
                  >
                    Start tracking
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                accessibilityRole="button"
                className="mt-6 flex-row items-center justify-center gap-1.5 py-2.5"
                onPress={() => void signOut()}
              >
                <LogOut size={15} color={iconMuted} strokeWidth={1.8} />
                <Text className={`text-sm font-sf-medium ${textMuted}`}>Sign out</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Dashboard Main View (Home vs Insights)
  const recentTransactions = currentMonthTransactions.slice(0, 6);

  return (
    <SafeAreaView className={`flex-1 ${bgMain}`} edges={["top", "bottom"]}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      <View className="flex-1">
        {activeTab === "Home" ? (
          // ==================== HOME TAB ====================
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(350)} className="mb-5 flex-row items-center justify-between">
              <Text className={`text-2xl font-sf-bold tracking-tight ${textPrimary}`}>
                {getGreeting()}
              </Text>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Toggle Dark Mode"
                  className={`h-10 w-10 items-center justify-center rounded-full border ${borderCard} ${bgCard}`}
                  onPress={() => setIsDarkMode((prev) => !prev)}
                >
                  {isDarkMode ? <Sun size={17} color={iconMuted} /> : <Moon size={17} color={iconMuted} />}
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  className={`h-10 w-10 items-center justify-center rounded-full border ${borderCard} ${bgCard}`}
                  onPress={() => void signOut()}
                >
                  <LogOut size={17} color={iconMuted} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Hero Spending Card */}
            <Animated.View
              entering={FadeInDown.delay(50).duration(350)}
              className={`rounded-[26px] border ${borderCard} ${bgCard} p-6 shadow-sm`}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-sf-semibold uppercase tracking-wider text-zinc-400">
                  Left to spend
                </Text>
                <View
                  className={`rounded-full px-2.5 py-1 ${
                    isDarkMode ? "bg-zinc-800/80" : "bg-zinc-100"
                  }`}
                >
                  <Text className={`text-xs font-sf-medium ${textMuted}`}>{monthLabel()}</Text>
                </View>
              </View>

              <Text className={`mt-3 text-[38px] font-sf-bold tracking-tight ${textPrimary}`}>
                {money(remaining)}
              </Text>
              <Text className={`mt-0.5 text-xs font-sf-medium ${textMuted}`}>
                of {money(totalAllowance)} total available
                {received > 0 ? ` (${money(data.budget)} budget + ${money(received)} added)` : ""}
              </Text>

              {/* Minimal Progress Bar */}
              <View
                className={`mt-5 h-2 overflow-hidden rounded-full ${
                  isDarkMode ? "bg-zinc-800/80" : "bg-zinc-100"
                }`}
              >
                <Animated.View
                  style={progressStyle}
                  className={`h-full rounded-full ${isDarkMode ? "bg-zinc-200" : "bg-zinc-800"}`}
                />
              </View>

              <View className="mt-2.5 flex-row justify-between">
                <Text className={`text-xs font-sf-medium ${textMuted}`}>{money(spent)} spent</Text>
                <Text className={`text-xs font-sf-semibold ${textPrimary}`}>
                  {Math.round(progress * 100)}% used
                </Text>
              </View>
            </Animated.View>

            {/* Metrics Row */}
            <Animated.View entering={FadeInDown.delay(100).duration(350)} className="mt-3.5 flex-row gap-3">
              <TouchableOpacity
                activeOpacity={0.85}
                className={`flex-1 rounded-[22px] border ${borderCard} ${bgCard} p-4 shadow-sm`}
                onPress={() => {
                  setBudgetInput(String(data.budget));
                  setFormError(null);
                  setModalType("budget");
                }}
              >
                <View className="flex-row items-center justify-between">
                  <Text className={`text-xs font-sf-medium ${textMuted}`}>Base budget</Text>
                  <PencilLine size={13} color={iconMuted} strokeWidth={1.8} />
                </View>
                <Text className={`mt-2 text-lg font-sf-bold ${textPrimary}`}>{money(data.budget)}</Text>
              </TouchableOpacity>

              <View className={`flex-1 rounded-[22px] border ${borderCard} ${bgCard} p-4 shadow-sm`}>
                <View className="flex-row items-center justify-between">
                  <Text className={`text-xs font-sf-medium ${textMuted}`}>Spent</Text>
                  <ArrowUpRight size={14} color={iconMuted} strokeWidth={1.8} />
                </View>
                <Text className={`mt-2 text-lg font-sf-bold ${textPrimary}`}>{money(spent)}</Text>
              </View>

              {received > 0 ? (
                <View className={`flex-1 rounded-[22px] border ${borderCard} ${bgCard} p-4 shadow-sm`}>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-sf-medium text-emerald-500">Added</Text>
                    <ArrowDownLeft size={14} color="#10B981" strokeWidth={1.8} />
                  </View>
                  <Text className="mt-2 text-lg font-sf-bold text-emerald-500">+{money(received)}</Text>
                </View>
              ) : null}
            </Animated.View>

            {/* Activity Header */}
            <Animated.View
              entering={FadeInDown.delay(150).duration(350)}
              className="mt-6 flex-row items-center justify-between"
            >
              <Text className={`text-lg font-sf-bold tracking-tight ${textPrimary}`}>
                Recent Activity
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.85}
                className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
                  isDarkMode ? "bg-white" : "bg-zinc-900"
                }`}
                onPress={() => {
                  setFormError(null);
                  setTransactionType("expense");
                  setExpenseTitle("");
                  setExpenseAmount("");
                  setExpenseCategory("Food");
                  setModalType("add-transaction");
                }}
              >
                <Plus size={14} color={isDarkMode ? "#18181B" : "#FFFFFF"} strokeWidth={2.2} />
                <Text
                  className={`text-xs font-sf-semibold ${
                    isDarkMode ? "text-zinc-900" : "text-white"
                  }`}
                >
                  Add
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Minimal Activity List */}
            <Animated.View
              entering={FadeInDown.delay(200).duration(350)}
              className={`mt-3 overflow-hidden rounded-[22px] border ${borderCard} ${bgCard} p-2 shadow-sm`}
            >
              {recentTransactions.length === 0 ? (
                <View className="items-center py-9">
                  <View
                    className={`mb-2.5 h-10 w-10 items-center justify-center rounded-xl ${
                      isDarkMode ? "bg-zinc-800/60" : "bg-zinc-100"
                    }`}
                  >
                    <ReceiptText size={20} color={iconMuted} strokeWidth={1.8} />
                  </View>
                  <Text className={`font-sf-medium text-sm ${textPrimary}`}>No activity yet</Text>
                  <Text className={`mt-0.5 text-xs ${textMuted}`}>
                    Tap Add to log an expense or received money.
                  </Text>
                </View>
              ) : (
                recentTransactions.map((item, index) => {
                  const isInc = isIncomeTransaction(item);
                  const category = item.category ?? (isInc ? "Income" : "Other");
                  const IconComponent = CATEGORY_ICONS[category] ?? (isInc ? ArrowDownLeft : Tag);

                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.title}`}
                      onPress={() => handleOpenEditTransaction(item)}
                      className={`flex-row items-center gap-3 rounded-xl p-2.5 ${
                        index !== recentTransactions.length - 1
                          ? isDarkMode
                            ? "border-b border-zinc-800/40"
                            : "border-b border-zinc-100"
                          : ""
                      }`}
                    >
                      <View
                        className={`h-9 w-9 items-center justify-center rounded-xl ${itemIconBg}`}
                      >
                        <IconComponent
                          size={16}
                          color={isInc ? "#10B981" : itemIconColor}
                          strokeWidth={1.8}
                        />
                      </View>

                      <View className="flex-1">
                        <Text numberOfLines={1} className={`text-sm font-sf-medium ${textPrimary}`}>
                          {item.title}
                        </Text>
                        <Text className={`text-[11px] font-sf-regular ${textMuted}`}>
                          {category} · {formatExpenseDate(item.date)}
                        </Text>
                      </View>

                      <View className="flex-row items-center gap-2">
                        <Text
                          className={`text-sm font-sf-semibold ${
                            isInc ? "text-emerald-500" : textPrimary
                          }`}
                        >
                          {isInc ? `+ ${money(item.amount)}` : `− ${money(item.amount)}`}
                        </Text>
                        <PencilLine size={12} color={iconMuted} strokeWidth={1.8} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </Animated.View>
          </ScrollView>
        ) : activeTab === "Insights" ? (
          // ==================== INSIGHTS TAB (Instant & Glitch-Free) ====================
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(300)} className="mb-4 flex-row items-center justify-between">
              <View>
                <Text className={`text-2xl font-sf-bold tracking-tight ${textPrimary}`}>
                  Insights
                </Text>
                <Text className={`mt-0.5 text-xs font-sf-medium ${textMuted}`}>
                  {period === "Year"
                    ? `${new Date().getFullYear()}`
                    : period === "Week"
                    ? "Last 7 days"
                    : monthLabel()}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Toggle Dark Mode"
                className={`h-10 w-10 items-center justify-center rounded-full border ${borderCard} ${bgCard}`}
                onPress={() => setIsDarkMode((prev) => !prev)}
              >
                {isDarkMode ? <Sun size={17} color={iconMuted} /> : <Moon size={17} color={iconMuted} />}
              </TouchableOpacity>
            </Animated.View>

            {/* Period Switcher */}
            <View
              className={`mb-4 flex-row rounded-2xl border ${borderCard} ${
                isDarkMode ? "bg-[#14151B]" : "bg-zinc-100/70"
              } p-1`}
            >
              {(["Week", "Month", "Year"] as Period[]).map((p) => {
                const isSelected = period === p;
                return (
                  <TouchableOpacity
                    key={p}
                    activeOpacity={0.8}
                    className={`flex-1 items-center rounded-xl py-2 ${
                      isSelected
                        ? isDarkMode
                          ? "bg-zinc-800"
                          : "bg-white"
                        : "bg-transparent"
                    }`}
                    onPress={() => setPeriod(p)}
                  >
                    <Text
                      className={`text-xs font-sf-semibold ${
                        isSelected ? textPrimary : textMuted
                      }`}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Donut Chart & Spending Summary Card */}
            <Animated.View
              entering={FadeInDown.delay(50).duration(300)}
              className={`rounded-[26px] border ${borderCard} ${bgCard} p-5 shadow-sm`}
            >
              <View className="mb-1 flex-row items-center justify-between">
                <Text className={`text-sm font-sf-bold ${textPrimary}`}>Spending Overview</Text>
                <View
                  className={`rounded-full px-2.5 py-1 ${
                    isDarkMode ? "bg-zinc-800" : "bg-zinc-100"
                  }`}
                >
                  <Text className={`text-xs font-sf-semibold ${textMuted}`}>
                    {insightsData.pct}% of budget
                  </Text>
                </View>
              </View>

              {/* Donut / Pie Chart */}
              <View className="items-center justify-center py-3">
                <View
                  style={{
                    width: 210,
                    height: 210,
                    position: "relative",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Svg width={210} height={210} viewBox="0 0 210 210">
                    {/* Base track */}
                    <Circle
                      cx="105"
                      cy="105"
                      r="68"
                      stroke={isDarkMode ? "#22232B" : "#F1F1EF"}
                      strokeWidth="18"
                      fill="none"
                    />

                    {/* Donut slices */}
                    {insightsData.slices.length > 0 && (
                      <G transform="rotate(-90 105 105)">
                        {insightsData.slices.map((slice) => (
                          <Circle
                            key={slice.name}
                            cx="105"
                            cy="105"
                            r="68"
                            stroke={slice.color}
                            strokeWidth="18"
                            strokeDasharray={slice.strokeDasharray}
                            strokeDashoffset={slice.strokeDashoffset}
                            fill="none"
                          />
                        ))}
                      </G>
                    )}
                  </Svg>

                  {/* Centered Donut Overlay */}
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    pointerEvents="none"
                  >
                    <Text className="text-[10px] font-sf-semibold uppercase tracking-wider text-zinc-400">
                      Total Spent
                    </Text>
                    <Text className={`mt-0.5 text-2xl font-sf-bold tracking-tight ${textPrimary}`}>
                      {money(insightsData.total)}
                    </Text>
                    <Text className={`mt-0.5 text-[11px] font-sf-medium ${textMuted}`}>
                      {period.toLowerCase()} view
                    </Text>
                  </View>
                </View>
              </View>

              {/* Budget Progress & Stats Footer */}
              <View className={`mt-2 border-t ${isDarkMode ? "border-zinc-800/60" : "border-zinc-100"} pt-3.5`}>
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className={`text-xs font-sf-medium ${textMuted}`}>
                    Budget: {money(insightsData.scopedBudget)}
                  </Text>
                  <Text
                    className={`text-xs font-sf-semibold ${
                      insightsData.scopedBudget > 0 && insightsData.total > insightsData.scopedBudget
                        ? "text-rose-500"
                        : textMuted
                    }`}
                  >
                    {insightsData.scopedBudget > 0 && insightsData.total > insightsData.scopedBudget
                      ? `${money(insightsData.total - insightsData.scopedBudget)} over`
                      : `${money(Math.max(0, insightsData.scopedBudget - insightsData.total))} left`}
                  </Text>
                </View>

                <View
                  className={`h-1.5 overflow-hidden rounded-full ${
                    isDarkMode ? "bg-zinc-800" : "bg-zinc-100"
                  }`}
                >
                  <View
                    className={`h-full rounded-full ${
                      insightsData.pct >= 100
                        ? "bg-rose-500"
                        : isDarkMode
                        ? "bg-zinc-200"
                        : "bg-zinc-900"
                    }`}
                    style={{ width: `${Math.min(100, insightsData.pct)}%` }}
                  />
                </View>

                <View className="mt-3.5 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <ReceiptText size={13} color={iconMuted} />
                    <Text className={`text-xs font-sf-medium ${textMuted}`}>
                      {insightsData.count} {insightsData.count === 1 ? "expense" : "expenses"}
                    </Text>
                  </View>
                  <Text className={`text-xs font-sf-medium ${textMuted}`}>
                    Avg {money(insightsData.count > 0 ? insightsData.total / insightsData.count : 0)} / item
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* Category Breakdown */}
            <Animated.View
              entering={FadeInDown.delay(100).duration(300)}
              className="mb-2 mt-5 flex-row items-center justify-between"
            >
              <Text className={`text-base font-sf-bold ${textPrimary}`}>By Category</Text>
              <Text className={`text-xs ${textMuted}`}>
                {insightsData.categories.length} {insightsData.categories.length === 1 ? "category" : "categories"}
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(150).duration(300)}
              className={`overflow-hidden rounded-[24px] border ${borderCard} ${bgCard} p-3.5 shadow-sm`}
            >
              {insightsData.categories.length === 0 ? (
                <View className="items-center py-7">
                  <Text className={`text-sm font-sf-medium ${textPrimary}`}>No expenses found</Text>
                  <Text className={`mt-0.5 text-xs ${textMuted}`}>
                    Log an expense to see your category insights.
                  </Text>
                </View>
              ) : (
                insightsData.categories.map((cat, idx) => {
                  const Icon = CATEGORY_ICONS[cat.name] ?? Tag;

                  return (
                    <View
                      key={cat.name}
                      className={`py-3 ${
                        idx !== insightsData.categories.length - 1
                          ? isDarkMode
                            ? "border-b border-zinc-800/40"
                            : "border-b border-zinc-100"
                          : ""
                      }`}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2.5">
                          <View
                            style={{ backgroundColor: `${cat.color}20` }}
                            className="h-8 w-8 items-center justify-center rounded-xl"
                          >
                            <Icon size={15} color={cat.color} strokeWidth={2} />
                          </View>
                          <Text className={`text-sm font-sf-medium ${textPrimary}`}>{cat.name}</Text>
                        </View>
                        <View className="flex-row items-center gap-2.5">
                          <Text className={`text-sm font-sf-semibold ${textPrimary}`}>
                            {money(cat.amount)}
                          </Text>
                          <View
                            style={{ backgroundColor: isDarkMode ? "#27272A" : "#F4F4F5" }}
                            className="min-w-[38px] items-center rounded-full px-2 py-0.5"
                          >
                            <Text className={`text-xs font-sf-semibold ${textMuted}`}>
                              {cat.pct}%
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View
                        className={`mt-2.5 h-1.5 overflow-hidden rounded-full ${
                          isDarkMode ? "bg-zinc-800" : "bg-zinc-100"
                        }`}
                      >
                        <View
                          className="h-full rounded-full"
                          style={{ width: `${cat.pct}%`, backgroundColor: cat.color }}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </Animated.View>

            {/* Quick Metrics */}
            <Animated.View entering={FadeInDown.delay(250).duration(300)} className="mt-3.5 flex-row gap-3">
              <View className={`flex-1 rounded-[22px] border ${borderCard} ${bgCard} p-4 shadow-sm`}>
                <Text className={`text-xs font-sf-medium ${textMuted}`}>Transactions</Text>
                <Text className={`mt-1.5 text-xl font-sf-bold ${textPrimary}`}>
                  {insightsData.count}
                </Text>
              </View>

              <View className={`flex-1 rounded-[22px] border ${borderCard} ${bgCard} p-4 shadow-sm`}>
                <Text className={`text-xs font-sf-medium ${textMuted}`}>Average spend</Text>
                <Text className={`mt-1.5 text-xl font-sf-bold ${textPrimary}`}>
                  {money(insightsData.count > 0 ? insightsData.total / insightsData.count : 0)}
                </Text>
              </View>
            </Animated.View>
          </ScrollView>
        ) : (
          // ==================== OTHER TABS PLACEHOLDER ====================
          <View className="flex-1 items-center justify-center p-6">
            <View
              className={`mb-3 h-12 w-12 items-center justify-center rounded-2xl ${
                isDarkMode ? "bg-zinc-800" : "bg-zinc-100"
              }`}
            >
              {activeTab === "Sheets" ? (
                <FileSpreadsheet size={24} color={iconMuted} strokeWidth={1.8} />
              ) : (
                <MoreHorizontal size={24} color={iconMuted} strokeWidth={1.8} />
              )}
            </View>
            <Text className={`text-lg font-sf-bold ${textPrimary}`}>{activeTab}</Text>
            <Text className={`mt-1 text-center text-xs ${textMuted}`}>
              {activeTab === "Sheets"
                ? "Google Sheets export & live sync view."
                : "Profile, settings & app configuration."}
            </Text>
          </View>
        )}

        {/* Minimal Bottom Tabs Bar */}
        <View
          className={`h-[68px] flex-row items-center justify-around border-t ${borderCard} ${bgCard} px-2`}
        >
          {[
            { Icon: Home, label: "Home" },
            { Icon: PieChart, label: "Insights" },
            { Icon: FileSpreadsheet, label: "Sheets" },
            { Icon: MoreHorizontal, label: "More" },
          ].map(({ Icon, label }) => {
            const isSelected = activeTab === label;
            return (
              <TouchableOpacity
                key={label}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="min-w-[56px] items-center gap-1"
                onPress={() => setActiveTab(label)}
              >
                <Icon
                  size={20}
                  color={
                    isSelected
                      ? isDarkMode
                        ? "#FFFFFF"
                        : "#18181B"
                      : isDarkMode
                      ? "#52525B"
                      : "#A1A1AA"
                  }
                  strokeWidth={isSelected ? 2.2 : 1.6}
                />
                <Text
                  className={`text-[10px] font-sf-medium ${
                    isSelected
                      ? isDarkMode
                        ? "text-white"
                        : "text-zinc-900"
                      : isDarkMode
                      ? "text-zinc-500"
                      : "text-zinc-400"
                  }`}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Modal for Budget or Add/Edit Transaction */}
      <Modal
        animationType="slide"
        onRequestClose={() => {
          setModalType(null);
          setEditingExpenseId(null);
        }}
        transparent
        visible={modalType !== null}
      >
        <View className="flex-1 justify-end bg-black/40">
          <Pressable
            accessibilityLabel="Close form"
            className="flex-1"
            onPress={() => {
              setModalType(null);
              setEditingExpenseId(null);
            }}
          />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View
              className={`rounded-t-[28px] border-t ${borderCard} ${
                isDarkMode ? "bg-[#14151B]" : "bg-white"
              } px-6 pb-9 pt-5 shadow-xl`}
            >
              <View className="mb-5 flex-row items-center justify-between">
                <Text className={`text-xl font-sf-bold ${textPrimary}`}>
                  {modalType === "budget"
                    ? "Monthly Budget"
                    : modalType === "edit-transaction"
                    ? "Edit Entry"
                    : "New Entry"}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className={`h-8 w-8 items-center justify-center rounded-full ${
                    isDarkMode ? "bg-zinc-800" : "bg-zinc-100"
                  }`}
                  onPress={() => {
                    setModalType(null);
                    setEditingExpenseId(null);
                  }}
                >
                  <X size={16} color={iconMuted} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {modalType === "budget" ? (
                <View
                  className={`flex-row items-center rounded-2xl border ${borderCard} ${
                    isDarkMode ? "bg-[#0C0D10]" : "bg-zinc-50"
                  } px-4`}
                >
                  <IndianRupee size={18} color={isDarkMode ? "#71717A" : "#A1A1AA"} strokeWidth={1.8} />
                  <TextInput
                    accessibilityLabel="Monthly budget amount"
                    className={`h-13 flex-1 pl-2 text-base font-sf-semibold ${textPrimary}`}
                    keyboardType="decimal-pad"
                    onChangeText={(val) => {
                      setBudgetInput(val);
                      setFormError(null);
                    }}
                    placeholder="Monthly budget"
                    placeholderTextColor={isDarkMode ? "#52525B" : "#A1A1AA"}
                    returnKeyType="done"
                    value={budgetInput}
                  />
                </View>
              ) : (
                <>
                  {/* Expense vs Income Toggle */}
                  <View
                    className={`mb-3.5 flex-row rounded-2xl border ${borderCard} ${
                      isDarkMode ? "bg-[#0C0D10]" : "bg-zinc-100/70"
                    } p-1`}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 ${
                        transactionType === "expense"
                          ? isDarkMode
                            ? "bg-zinc-800"
                            : "bg-white"
                          : "bg-transparent"
                      }`}
                      onPress={() => {
                        setTransactionType("expense");
                        setExpenseCategory("Food");
                      }}
                    >
                      <ArrowUpRight
                        size={14}
                        color={transactionType === "expense" ? (isDarkMode ? "#FFFFFF" : "#18181B") : iconMuted}
                        strokeWidth={2}
                      />
                      <Text
                        className={`text-xs font-sf-semibold ${
                          transactionType === "expense"
                            ? isDarkMode
                              ? "text-white"
                              : "text-zinc-900"
                            : textMuted
                        }`}
                      >
                        Expense
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 ${
                        transactionType === "income"
                          ? isDarkMode
                            ? "bg-zinc-800"
                            : "bg-white"
                          : "bg-transparent"
                      }`}
                      onPress={() => {
                        setTransactionType("income");
                        setExpenseCategory("Salary");
                      }}
                    >
                      <ArrowDownLeft
                        size={14}
                        color={transactionType === "income" ? "#10B981" : iconMuted}
                        strokeWidth={2}
                      />
                      <Text
                        className={`text-xs font-sf-semibold ${
                          transactionType === "income" ? "text-emerald-500" : textMuted
                        }`}
                      >
                        Received Money
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    accessibilityLabel="Transaction title"
                    autoFocus
                    className={`mb-2.5 h-13 rounded-2xl border ${borderCard} ${
                      isDarkMode ? "bg-[#0C0D10]" : "bg-zinc-50"
                    } px-4 text-base font-sf-medium ${textPrimary}`}
                    onChangeText={(val) => {
                      setExpenseTitle(val);
                      setFormError(null);
                    }}
                    placeholder={transactionType === "income" ? "From who or what?" : "What was it for?"}
                    placeholderTextColor={isDarkMode ? "#52525B" : "#A1A1AA"}
                    value={expenseTitle}
                  />

                  <View
                    className={`flex-row items-center rounded-2xl border ${borderCard} ${
                      isDarkMode ? "bg-[#0C0D10]" : "bg-zinc-50"
                    } px-4`}
                  >
                    <IndianRupee size={18} color={isDarkMode ? "#71717A" : "#A1A1AA"} strokeWidth={1.8} />
                    <TextInput
                      accessibilityLabel="Transaction amount"
                      className={`h-13 flex-1 pl-2 text-base font-sf-semibold ${textPrimary}`}
                      keyboardType="decimal-pad"
                      onChangeText={(val) => {
                        setExpenseAmount(val);
                        setFormError(null);
                      }}
                      placeholder="Amount"
                      placeholderTextColor={isDarkMode ? "#52525B" : "#A1A1AA"}
                      returnKeyType="done"
                      value={expenseAmount}
                    />
                  </View>

                  {/* Minimal Category Selector based on Transaction Type */}
                  <View className="mt-3.5 flex-row flex-wrap gap-2">
                    {(transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => {
                      const Icon = CATEGORY_ICONS[cat] ?? Tag;
                      const selected = expenseCategory === cat;
                      return (
                        <TouchableOpacity
                          key={`${transactionType}-${cat}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${
                            selected
                              ? isDarkMode
                                ? "bg-white"
                                : "bg-zinc-900"
                              : isDarkMode
                              ? "border border-zinc-800 bg-[#0C0D10]"
                              : "border border-zinc-200 bg-zinc-50"
                          }`}
                          onPress={() => setExpenseCategory(cat)}
                        >
                          <Icon
                            size={13}
                            color={
                              selected
                                ? isDarkMode
                                  ? "#18181B"
                                  : "#FFFFFF"
                                : isDarkMode
                                ? "#A1A1AA"
                                : "#71717A"
                            }
                            strokeWidth={1.8}
                          />
                          <Text
                            className={`text-xs font-sf-medium ${
                              selected
                                ? isDarkMode
                                  ? "text-zinc-900"
                                  : "text-white"
                                : isDarkMode
                                ? "text-zinc-400"
                                : "text-zinc-600"
                            }`}
                          >
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {formError ? (
                <Text accessibilityLiveRegion="polite" className="mt-3 text-sm font-sf-medium text-red-500">
                  {formError}
                </Text>
              ) : null}

              {/* Main Submit Button */}
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.88}
                className={`mt-5 h-[52px] items-center justify-center rounded-2xl ${
                  isDarkMode ? "bg-white" : "bg-zinc-900"
                }`}
                disabled={isSaving}
                onPress={
                  modalType === "budget"
                    ? handleSaveBudget
                    : modalType === "edit-transaction"
                    ? handleUpdateTransaction
                    : handleAddTransaction
                }
              >
                {isSaving ? (
                  <ActivityIndicator color={isDarkMode ? "#18181B" : "#FFFFFF"} />
                ) : (
                  <Text
                    className={`text-base font-sf-semibold ${
                      isDarkMode ? "text-zinc-900" : "text-white"
                    }`}
                  >
                    {modalType === "budget"
                      ? "Save Budget"
                      : modalType === "edit-transaction"
                      ? "Update Entry"
                      : transactionType === "income"
                      ? "Add Received Money"
                      : "Save Expense"}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Delete Button for Edit Mode */}
              {modalType === "edit-transaction" ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Delete this transaction"
                  className="mt-3 flex-row items-center justify-center gap-1.5 py-2.5"
                  disabled={isSaving}
                  onPress={handleDeleteTransaction}
                >
                  <Trash2 size={15} color="#EF4444" strokeWidth={1.8} />
                  <Text className="text-sm font-sf-medium text-red-500">Delete Entry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
