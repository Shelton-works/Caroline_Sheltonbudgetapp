import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  useColorScheme,
} from 'react-native';
import { Colors } from '../constants/theme';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}) => {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          style={[styles.dialog, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.onSurfaceVariant }]}>
            {message}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnCancel, { borderColor: colors.outlineVariant }]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: colors.onSurface }]}>
                {cancelLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnConfirm,
                { backgroundColor: destructive ? colors.expense : colors.primary },
              ]}
              onPress={onConfirm}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, { color: '#FFFFFF' }]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Montserrat',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    borderWidth: 1,
  },
  btnConfirm: {},
  btnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
