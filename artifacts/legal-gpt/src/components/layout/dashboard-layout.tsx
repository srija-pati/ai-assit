import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { ReactNode, useEffect } from "react";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter } from "@/components/ui/sidebar";
import { LayoutDashboard, Upload, MessageSquare, FileText, Users, Mail, History, Shield, Settings, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useLogout } from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user, logout: localLogout } = useAuth();
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const logout = useLogout();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => { localLogout(); setLocation("/login"); },
      onError: () => { localLogout(); setLocation("/login"); }
    });
  };

  const navItems = [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Upload Documents", href: "/dashboard/upload", icon: Upload },
    { title: "AI Chat", href: "/dashboard/chat", icon: MessageSquare },
    { title: "Generate Document", href: "/dashboard/generate", icon: FileText },
    { title: "Advocate Search", href: "/dashboard/advocates", icon: Users },
    { title: "Send Letter", href: "/dashboard/email", icon: Mail },
    { title: "History", href: "/dashboard/history", icon: History },
    { title: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  const initials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()
    : "U";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar className="border-r">
          <SidebarHeader className="h-16 flex items-center px-4 border-b">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-accent" />
              <span className="font-serif font-bold text-xl tracking-tight text-primary dark:text-white">LegalGPT</span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild>
                        <a href={item.href} className="flex items-center gap-3">
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}

                  {user?.role === "admin" && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild>
                        <a href="/dashboard/admin" className="flex items-center gap-3 text-accent">
                          <Shield className="w-4 h-4" />
                          <span>Admin Panel</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="flex items-center gap-3">
                      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      <span>Toggle Theme</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleLogout} className="flex items-center gap-3 text-destructive">
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">{user?.role}</p>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 bg-background overflow-auto">
          <div className="bg-primary/5 text-primary-foreground p-2 text-center text-xs border-b border-primary/10">
            <span className="text-primary font-medium">Disclaimer:</span> This system provides AI-assisted legal information, not professional legal advice.
          </div>
          <div className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
