import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useLogin, useSignup } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Eye, EyeOff, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();

  const loginMutation = useLogin();
  const signupMutation = useSignup();

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setEmail("");
    setPassword("");
    setName("");
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate({ data: { email, password } }, {
      onSuccess: (data) => {
        login(data.user, data.token);
        toast({ title: "Welcome back", description: "Successfully logged in." });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({ title: "Login failed", description: error.error?.error || "Invalid credentials", variant: "destructive" });
      }
    });
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) return;
    signupMutation.mutate({ data: { email, password, name } }, {
      onSuccess: (data) => {
        login(data.user, data.token);
        toast({ title: "Account created", description: "Welcome to LegalGPT." });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({ title: "Signup failed", description: error.error?.error || "Could not create account", variant: "destructive" });
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-foreground">LegalGPT</h1>
          <p className="text-muted-foreground text-sm mt-1">Premium AI Legal Assistant</p>
        </div>

        <Card className="shadow-xl border-border/50 overflow-hidden">
          {/* Tab switcher */}
          <div className="grid grid-cols-2 border-b">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`py-4 text-sm font-semibold transition-colors ${
                mode === "login"
                  ? "bg-background text-foreground border-b-2 border-primary"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`py-4 text-sm font-semibold transition-colors ${
                mode === "signup"
                  ? "bg-background text-foreground border-b-2 border-primary"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              Sign Up
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin}>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Welcome back</CardTitle>
                <CardDescription>Enter your credentials to access your account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  {!loginMutation.isPending && <ChevronRight className="w-4 h-4 ml-1" />}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => switchMode("signup")} className="text-primary hover:underline font-medium">
                    Sign Up
                  </button>
                </p>
              </CardFooter>
            </form>
          ) : (
            <form onSubmit={handleSignup}>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Create an account</CardTitle>
                <CardDescription>Enter your details to get started with LegalGPT.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email address</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3 pt-2">
                <Button type="submit" className="w-full" disabled={signupMutation.isPending}>
                  {signupMutation.isPending ? "Creating account..." : "Create Account"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Already have an account?{" "}
                  <button type="button" onClick={() => switchMode("login")} className="text-primary hover:underline font-medium">
                    Sign In
                  </button>
                </p>
              </CardFooter>
            </form>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          This system provides AI-assisted legal information, not professional legal advice.
        </p>
      </div>
    </div>
  );
}
