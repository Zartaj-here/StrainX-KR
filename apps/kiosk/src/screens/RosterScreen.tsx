import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { loadKioskSession } from "@/lib/session";
import { useCopy } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { S, T } from "@/lib/theme";

export type RosterEntry = {
  id: string;
  display_name: string;
  photo_url: string | null;
  assigned_kiosk_device_id: string | null;
};

// Name + photo grid — the ONLY participant data a kiosk reads, via the
// kiosk_roster() RPC (Invariant 8). Enforces one-kiosk-per-participant
// (Invariant 9): tapping a participant assigned to another device is refused.
export function RosterScreen({ onSelect }: { onSelect: (p: RosterEntry) => void }) {
  const COPY = useCopy();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [warning, setWarning] = useState("");

  const load = useCallback(async () => {
    const session = await loadKioskSession();
    setDeviceId(session?.deviceId ?? null);
    const { data } = await supabase.rpc("kiosk_roster");
    setRoster((data as RosterEntry[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pick = (p: RosterEntry) => {
    // Invariant 9: a participant is read on ONE fixed kiosk for the whole
    // deployment, so device bias cancels into her personal baseline.
    if (p.assigned_kiosk_device_id && deviceId && p.assigned_kiosk_device_id !== deviceId) {
      setWarning(COPY.roster.wrongDevice(p.assigned_kiosk_device_id.slice(0, 8)));
      return;
    }
    setWarning("");
    onSelect(p);
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, padding: 20 }}>
      <View style={{ alignItems: "flex-end", marginBottom: 8 }}><LanguageSwitcher /></View>
      <Text style={[S.h1, { marginBottom: 6 }]}>{COPY.roster.title}</Text>
      <Text style={[S.body, { color: T.sub, marginBottom: 14 }]}>{COPY.roster.scanHint}</Text>
      {warning ? <Text style={{ color: T.danger, textAlign: "center", fontSize: 18, marginBottom: 10 }}>{warning}</Text> : null}
      <FlatList
        data={roster}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 14 }}
        contentContainerStyle={{ gap: 14 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pick(item)}
            style={{
              flex: 1, backgroundColor: T.card, borderWidth: 2, borderColor: T.border,
              borderRadius: 20, padding: 16, alignItems: "center", gap: 10, minHeight: 180,
              justifyContent: "center",
            }}
          >
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={{ width: 96, height: 96, borderRadius: 48 }} />
            ) : (
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "#fde8c8", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 40 }}>🙂</Text>
              </View>
            )}
            <Text style={{ fontSize: 24, fontWeight: "700", color: T.ink }}>{item.display_name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
