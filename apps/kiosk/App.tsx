import { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Camera } from "react-native-vision-camera";
import { supabase } from "@/lib/supabase";
import { loadKioskSession } from "@/lib/session";
import { LoginScreen } from "@/screens/LoginScreen";
import { RosterScreen, type RosterEntry } from "@/screens/RosterScreen";
import { CaptureMenuScreen } from "@/screens/CaptureMenuScreen";
import { PpgCaptureScreen } from "@/screens/PpgCaptureScreen";
import { ActivityCaptureScreen } from "@/screens/ActivityCaptureScreen";
import { ReactionGameScreen } from "@/screens/ReactionGameScreen";
import { StudyCaptureScreen } from "@/screens/StudyCaptureScreen";
import { LocaleProvider } from "@/lib/i18n";
import { T } from "@/lib/theme";

// The kiosk is write-only and auto-returns to the roster after every capture
// (§8). One staff sign-in persists; participants never log in.
type Screen =
  | { name: "login" }
  | { name: "roster" }
  | { name: "menu"; p: RosterEntry }
  | { name: "ppg"; p: RosterEntry }
  | { name: "activity"; p: RosterEntry }
  | { name: "reaction"; p: RosterEntry }
  | { name: "healthrec"; p: RosterEntry };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "login" });
  const [ready, setReady] = useState(false);
  const [studyMode, setStudyMode] = useState(false);

  useEffect(() => {
    (async () => {
      await Camera.requestCameraPermission();
      const session = await loadKioskSession();
      const { data: { user } } = await supabase.auth.getUser();
      setStudyMode(session?.studyMode === true);
      setScreen(user && session ? { name: "roster" } : { name: "login" });
      setReady(true);
    })();
  }, []);

  const toRoster = useCallback(() => setScreen({ name: "roster" }), []);

  return (
    <SafeAreaProvider>
      <LocaleProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }}>
        {!ready ? null : screen.name === "login" ? (
          <LoginScreen onDone={toRoster} />
        ) : screen.name === "roster" ? (
          <RosterScreen onSelect={(p) => setScreen({ name: "menu", p })} />
        ) : screen.name === "menu" ? (
          <CaptureMenuScreen
            participant={screen.p}
            studyMode={studyMode}
            onPpg={() => setScreen({ name: "ppg", p: screen.p })}
            onActivity={() => setScreen({ name: "activity", p: screen.p })}
            onReaction={() => setScreen({ name: "reaction", p: screen.p })}
            onStudy={() => setScreen({ name: "healthrec", p: screen.p })}
            onBack={toRoster}
          />
        ) : screen.name === "ppg" ? (
          <PpgCaptureScreen
            participantId={screen.p.id}
            context="daily"
            onComplete={toRoster}
            onCancel={toRoster}
          />
        ) : screen.name === "activity" ? (
          <ActivityCaptureScreen participant={screen.p} onDone={toRoster} />
        ) : screen.name === "healthrec" ? (
          <StudyCaptureScreen participantId={screen.p.id} onDone={toRoster} />
        ) : (
          <ReactionGameScreen participant={screen.p} onDone={toRoster} />
        )}
      </SafeAreaView>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
