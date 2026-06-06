import { useEffect, useState, type FormEvent } from "react";
import { useStore } from "../store.tsx";
import { ProfileInitials } from "./ProfileInitials.tsx";
import { Button } from "./ui/Button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import { InputField, InputGroup } from "./ui/input-group.tsx";

interface ProfileNameFormProps {
  initialName: string;
  submitLabel: string;
  onSave: (name: string) => Promise<void>;
  onCancel?: () => void;
}

export function ProfileNameDialog() {
  const { profileOverview, profileLoading, setProfileName } = useStore();
  const [dismissed, setDismissed] = useState(false);
  const name = profileOverview?.profile.name.trim() ?? "";
  const open = !profileLoading && !dismissed && profileOverview !== null && name.length === 0;

  return (
    <Dialog
      open={open}
      modal
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDismissed(true);
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Set up your profile</DialogTitle>
          <DialogDescription>
            Add your name so Felix can personalize your build stats.
          </DialogDescription>
        </DialogHeader>
        <ProfileNameForm
          initialName=""
          submitLabel="Save"
          onCancel={() => setDismissed(true)}
          onSave={async (nextName) => {
            await setProfileName(nextName);
            setDismissed(true);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function ProfileNameForm({
  initialName,
  submitLabel,
  onSave,
  onCancel,
}: ProfileNameFormProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();

  useEffect(() => {
    setName(initialName);
    setError(null);
  }, [initialName]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (trimmedName.length === 0) {
      setError("Enter a name to save your profile.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(trimmedName);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save your name.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => void submit(event)}>
      <div className="flex items-center gap-4">
        <ProfileInitials name={trimmedName} size="lg" />
        <InputGroup className="min-w-0 flex-1">
          <InputField
            index={0}
            label="Name"
            value={name}
            onChange={(value) => {
              setName(value);
              if (error) setError(null);
            }}
            placeholder="Alex Taylor"
            error={error ?? undefined}
            autoFocus
          />
        </InputGroup>
      </div>
      <DialogFooter className="mt-0">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Maybe later
          </Button>
        )}
        <Button type="submit" size="sm" loading={saving} disabled={trimmedName.length === 0}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
