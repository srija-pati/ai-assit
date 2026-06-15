import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/theme-provider";
import { Switch } from "@/components/ui/switch";
import { Shield, User, Bell, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    toast({ title: "Settings Saved", description: "Your profile has been updated." });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your account preferences and application settings.</p>
      </div>

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5"/> Profile Information</CardTitle>
            <CardDescription>Update your personal details.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSaveProfile}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue={user?.name || ""} />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input defaultValue={user?.email || ""} disabled className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">Contact support to change email.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input defaultValue={user?.role || ""} disabled className="bg-muted/50 capitalize" />
              </div>
            </CardContent>
            <CardFooter className="border-t py-4">
              <Button type="submit">Save Changes</Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5"/> Preferences</CardTitle>
            <CardDescription>Customize your application experience.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Dark Mode</Label>
                <p className="text-sm text-muted-foreground">Switch between light and dark themes.</p>
              </div>
              <Switch 
                checked={theme === 'dark'} 
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} 
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive updates when documents finish processing.</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2"><Lock className="w-5 h-5"/> Privacy & Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/30 p-4 rounded-lg border">
              <h4 className="font-semibold mb-2">Data Privacy Notice</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Documents uploaded to LegalGPT are encrypted at rest and in transit. 
                They are processed through secure LLM endpoints and stored in a private vector database.
                We do not use your documents to train public models.
              </p>
            </div>
            <div className="pt-4">
              <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive hover:text-white">
                Delete Account & All Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
