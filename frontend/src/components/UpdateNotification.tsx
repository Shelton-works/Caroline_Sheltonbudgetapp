import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Colors, BorderRadius } from '@/constants/theme';

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export default function UpdateNotification() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return; // Not running in Electron

    const cleanups = [
      api.onUpdateAvailable((version: string) => {
        console.log(`[update] Update available: v${version}`);
        setState({ status: 'available', version });
        setDismissed(false);
      }),
      api.onUpdateNotAvailable((version?: string) => {
        if (version) {
          console.log(`[update] No update available (v${version} is current)`);
        } else {
          console.log('[update] No update available — you are on the latest version');
        }
      }),
      api.onUpdateDownloadProgress((percent: number) => {
        console.log(`[update] Downloading... ${Math.round(percent)}%`);
        setState({ status: 'downloading', percent });
      }),
      api.onUpdateDownloaded((version: string) => {
        console.log(`[update] Update v${version} downloaded and ready to install`);
        setState({ status: 'downloaded', version });
      }),
      api.onUpdateError((message: string) => {
        console.error(`[update] Error: ${message}`);
        setState({ status: 'error', message });
      }),
    ];

    return () => {
      cleanups.forEach((fn: (() => void) | undefined) => fn?.());
    };
  }, []);

  const handleDownload = useCallback(() => {
    const api = (window as any).electronAPI;
    api?.startUpdateDownload();
  }, []);

  const handleInstall = useCallback(() => {
    const api = (window as any).electronAPI;
    api?.installUpdate();
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (dismissed || state.status === 'idle') return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceContainerLow }]}>
      {state.status === 'available' && (
        <View style={styles.row}>
          <Text style={styles.emoji}>📦</Text>
          <Text style={[styles.text, { color: colors.onSurface }]}>
            Update v{state.version} available
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleDownload}
          >
            <Text style={[styles.btnText, { color: colors.onPrimary }]}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDismiss}>
            <Text style={[styles.dismiss, { color: colors.onSurfaceVariant }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.status === 'downloading' && (
        <View style={styles.column}>
          <View style={styles.row}>
            <Text style={styles.emoji}>⏬</Text>
            <Text style={[styles.text, { color: colors.onSurface }]}>
              Downloading update… {Math.round(state.percent)}%
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceContainerHighest }]}>
            <View
              style={[styles.progressFill, { width: `${state.percent}%`, backgroundColor: colors.primary }]}
            />
          </View>
        </View>
      )}

      {state.status === 'downloaded' && (
        <View style={styles.row}>
          <Text style={styles.emoji}>✅</Text>
          <Text style={[styles.text, { color: colors.onSurface }]}>
            Update ready — restart to apply
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleInstall}
          >
            <Text style={[styles.btnText, { color: colors.onPrimary }]}>Restart</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDismiss}>
            <Text style={[styles.dismiss, { color: colors.onSurfaceVariant }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.row}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={[styles.text, { color: '#BA1A1A' }]} numberOfLines={1}>
            Update failed: {state.message}
          </Text>
          <TouchableOpacity onPress={handleDismiss}>
            <Text style={[styles.dismiss, { color: colors.onSurfaceVariant }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  column: {
    gap: 6,
  },
  emoji: {
    fontSize: 16,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dismiss: {
    fontSize: 16,
    paddingLeft: 4,
    opacity: 0.6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
