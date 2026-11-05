import { useEffect, useMemo, useState } from "react";
import { Redirect } from "expo-router";
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

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Dashboard() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();

  const [data, setData] = useState<BudgetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Modal form states: budget, add-transaction, or edit-transaction
  const [modalType, setModalType] = useState<"budget" | "add-transaction" | "edit-transaction" | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<string>("Food");

  // Calculations for current month
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

  // Remaining budget: monthly budget + received money - spent
  const totalAllowance = (data?.budget ?? 0) + received;
  const remaining = Math.max(0, totalAllowance - spent);
  const progress = totalAllowance > 0 ? Math.min(1, spent / totalAllowance) : 0;

  // Animated progress bar
  const progressValue = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressValue.value * 100}%` }));

  useEffect(() => {
    progressValue.value = withTiming(progress, { duration: 600 });
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

  // Add new transaction (expense or income) to Neon
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

  // Update existing transaction in Neon
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

  // Delete transaction from Neon
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

  // Dashboard Main View
  const recentTransactions = currentMonthTransactions.slice(0, 6);

  return (
    <SafeAreaView className={`flex-1 ${bgMain}`} edges={["top", "bottom"]}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header: Greeting based on local time */}
          <Animated.View entering={FadeInDown.duration(400)} className="mb-5 flex-row items-center justify-between">
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

          {/* Hero Spending Card - Minimal & Clean in Light & Dark */}
          <Animated.View
            entering={FadeInDown.delay(60).duration(400)}
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

          {/* Metrics Row: Spent & Received / Budget */}
          <Animated.View entering={FadeInDown.delay(120).duration(400)} className="mt-3.5 flex-row gap-3">
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
            entering={FadeInDown.delay(180).duration(400)}
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

          {/* Minimal Activity List with Tap-to-Edit */}
          <Animated.View
            entering={FadeInDown.delay(240).duration(400)}
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
                    {/* Minimal Neutral Icon Container */}
                    <View
                      className={`h-9 w-9 items-center justify-center rounded-xl ${itemIconBg}`}
                    >
                      <IconComponent
                        size={16}
                        color={isInc ? "#10B981" : itemIconColor}
                        strokeWidth={1.8}
                      />
                    </View>

                    {/* Title & Date */}
                    <View className="flex-1">
                      <Text numberOfLines={1} className={`text-sm font-sf-medium ${textPrimary}`}>
                        {item.title}
                      </Text>
                      <Text className={`text-[11px] font-sf-regular ${textMuted}`}>
                        {category} · {formatExpenseDate(item.date)}
                      </Text>
                    </View>

                    {/* Amount & Edit Indicator */}
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

        {/* Minimal Bottom Tabs */}
        <View
          className={`h-[68px] flex-row items-center justify-around border-t ${borderCard} ${bgCard} px-2`}
        >
          {[
            { Icon: Home, label: "Home", selected: true },
            { Icon: PieChart, label: "Insights", selected: false },
            { Icon: FileSpreadsheet, label: "Sheets", selected: false },
            { Icon: MoreHorizontal, label: "More", selected: false },
          ].map(({ Icon, label, selected }) => (
            <TouchableOpacity
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="min-w-[56px] items-center gap-1"
            >
              <Icon
                size={20}
                color={
                  selected
                    ? isDarkMode
                      ? "#FFFFFF"
                      : "#18181B"
                    : isDarkMode
                    ? "#52525B"
                    : "#A1A1AA"
                }
                strokeWidth={selected ? 2.2 : 1.6}
              />
              <Text
                className={`text-[10px] font-sf-medium ${
                  selected
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
          ))}
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
