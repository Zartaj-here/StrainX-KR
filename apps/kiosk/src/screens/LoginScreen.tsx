import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { clearKioskSession, loadKioskSession } from "@/lib/session";
import { useCopy } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { S, T } from "@/lib/theme";

// Staff authenticates the device once; the session persists (§8). The operator
// also records their own staff id so every capture stores operator_staff_id.
export function LoginScreen({ onDone }: { onDone: () => void }) {
  const COPY = useCopy();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staffId, setStaffId] = useState("");
  const [error, setError] = useState("");

  const signIn = async () => {
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(COPY.login.error); return; }
    await AsyncStorage.setItem("operator_staff_id", staffId.trim());
    clearKioskSession();
    const session = await loadKioskSession();
    if (!session) { setError(COPY.login.notKiosk); await supabase.auth.signOut(); return; }
    onDone();
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: "center", padding: 28, gap: 16 }}>
      <LanguageSwitcher />
      <Text style={S.h1}>{COPY.login.title}</Text>
      <TextInput
        placeholder={COPY.login.email} autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} style={inputStyle}
      />
      <TextInput
        placeholder={COPY.login.password} secureTextEntry
        value={password} onChangeText={setPassword} style={inputStyle}
      />
      <TextInput
        placeholder={COPY.login.staffId} value={staffId} onChangeText={setStaffId} style={inputStyle}
      />
      <Pressable onPress={() => void signIn()} style={[S.bigBtn, { backgroundColor: T.amber }]}>
        <Text style={S.bigBtnText}>{COPY.login.signIn}</Text>
      </Pressable>
      {error ? <Text style={{ color: T.danger, textAlign: "center", fontSize: 18 }}>{error}</Text> : null}
    </View>
  );
}

const inputStyle = {
  borderWidth: 2, borderColor: T.border, borderRadius: 14,
  paddingHorizontal: 18, paddingVertical: 16, fontSize: 20, backgroundColor: "#fff",
};
