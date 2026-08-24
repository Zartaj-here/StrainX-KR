// Language picker for the kiosk. Large, high-contrast buttons (elderly-first).
// Shown on the login and roster screens so staff/members can pick a language.

import { View, Pressable, Text } from "react-native";
import { LOCALES } from "@/lib/copy";
import { useLocale } from "@/lib/i18n";
import { T } from "@/lib/theme";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
      {LOCALES.map((l) => {
        const on = l.code === locale;
        return (
          <Pressable
            key={l.code}
            onPress={() => setLocale(l.code)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 10,
              backgroundColor: on ? T.amber : T.border,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: on ? "#fff" : T.sub }}>{l.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
