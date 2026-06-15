import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, MessageSquare, Edit3, Users, Mail, Activity, ArrowRight, Upload } from "lucide-react";
import { Link } from "wouter";

export default function DashboardHome() {
  const { data: summary, isLoading } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading dashboard...</div>;
  }

  const stats = [
    { title: "Uploaded Documents", value: summary?.uploadedDocuments || 0, icon: FileText, color: "text-blue-500", link: "/dashboard/upload" },
    { title: "Questions Asked", value: summary?.questionsAsked || 0, icon: MessageSquare, color: "text-purple-500", link: "/dashboard/chat" },
    { title: "Drafts Generated", value: summary?.draftsGenerated || 0, icon: Edit3, color: "text-amber-500", link: "/dashboard/generate" },
    { title: "Advocates Found", value: summary?.advocatesFound || 0, icon: Users, color: "text-green-500", link: "/dashboard/advocates" },
    { title: "Letters Sent", value: summary?.lettersSent || 0, icon: Mail, color: "text-rose-500", link: "/dashboard/email" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back to LegalGPT. Here is an overview of your activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((stat, i) => (
          <Link key={i} href={stat.link}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between space-x-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-muted-foreground">{stat.title}</span>
                    <span className="text-3xl font-bold">{stat.value}</span>
                  </div>
                  <div className={`p-3 bg-muted rounded-full group-hover:bg-primary/5 transition-colors ${stat.color}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <CardTitle className="text-xl flex items-center gap-2">
                <Activity className="w-5 h-5 text-muted-foreground" />
                Recent Activity
              </CardTitle>
              <Link href="/dashboard/history" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {summary?.recentActivity && summary.recentActivity.length > 0 ? (
                <div className="divide-y">
                  {summary.recentActivity.map((item) => (
                    <div key={item.id} className="p-4 hover:bg-muted/30 transition-colors flex items-start gap-4">
                      <div className="mt-1">
                        {item.type === 'upload' && <FileText className="w-4 h-4 text-blue-500" />}
                        {item.type === 'chat' && <MessageSquare className="w-4 h-4 text-purple-500" />}
                        {item.type === 'extract' && <FileText className="w-4 h-4 text-amber-500" />}
                        {item.type === 'generate' && <Edit3 className="w-4 h-4 text-emerald-500" />}
                        {item.type === 'email' && <Mail className="w-4 h-4 text-rose-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No recent activity found.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="bg-primary text-primary-foreground border-none">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/dashboard/upload" className="block px-4 py-3 bg-white/10 rounded-md hover:bg-white/20 transition-colors text-sm font-medium flex items-center gap-3">
                <Upload className="w-4 h-4 text-accent" /> Upload a new document
              </Link>
              <Link href="/dashboard/chat" className="block px-4 py-3 bg-white/10 rounded-md hover:bg-white/20 transition-colors text-sm font-medium flex items-center gap-3">
                <MessageSquare className="w-4 h-4 text-accent" /> Ask a legal question
              </Link>
              <Link href="/dashboard/generate" className="block px-4 py-3 bg-white/10 rounded-md hover:bg-white/20 transition-colors text-sm font-medium flex items-center gap-3">
                <Edit3 className="w-4 h-4 text-accent" /> Draft a new contract
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
