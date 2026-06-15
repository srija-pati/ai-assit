import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import DashboardHome from "@/pages/dashboard/index";
import UploadPage from "@/pages/dashboard/upload";
import ChatPage from "@/pages/dashboard/chat";
import ClausesPage from "@/pages/dashboard/clauses";
import GeneratePage from "@/pages/dashboard/generate";
import AdvocatesPage from "@/pages/dashboard/advocates";
import EmailPage from "@/pages/dashboard/email";
import AdminPage from "@/pages/dashboard/admin";
import SettingsPage from "@/pages/dashboard/settings";
import HistoryPage from "@/pages/dashboard/history";

const queryClient = new QueryClient();

function DashboardRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={DashboardHome} />
        <Route path="/dashboard/upload" component={UploadPage} />
        <Route path="/dashboard/chat" component={ChatPage} />
        <Route path="/dashboard/clauses" component={ClausesPage} />
        <Route path="/dashboard/generate" component={GeneratePage} />
        <Route path="/dashboard/advocates" component={AdvocatesPage} />
        <Route path="/dashboard/email" component={EmailPage} />
        <Route path="/dashboard/admin" component={AdminPage} />
        <Route path="/dashboard/settings" component={SettingsPage} />
        <Route path="/dashboard/history" component={HistoryPage} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard/*" component={DashboardRoutes} />
      <Route path="/dashboard" component={DashboardRoutes} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="legalgpt-theme">
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
