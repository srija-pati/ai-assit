import { useGetAdminStats, getGetAdminStatsQueryKey, useListUsers, getListUsersQueryKey, useListAdminLogs, getListAdminLogsQueryKey, useReindexDocuments } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, FileText, Database, Activity, RefreshCw, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminPage() {
  const { toast } = useToast();
  
  const { data: stats, isLoading: statsLoading } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey() } });
  const { data: users = [], isLoading: usersLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const { data: logs = [], isLoading: logsLoading } = useListAdminLogs({ query: { queryKey: getListAdminLogsQueryKey() } });
  const reindexMutation = useReindexDocuments();

  const handleReindex = () => {
    reindexMutation.mutate(undefined, {
      onSuccess: () => toast({ title: "Re-indexing Started", description: "Vector database is being rebuilt." }),
      onError: () => toast({ title: "Action Failed", description: "Could not trigger re-index.", variant: "destructive" })
    });
  };

  if (statsLoading || usersLoading || logsLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading admin dashboard...</div>;
  }

  const overviewStats = [
    { title: "Total Users", value: stats?.totalUsers || 0, icon: Users, color: "text-blue-500" },
    { title: "Total Documents", value: stats?.totalDocuments || 0, icon: FileText, color: "text-emerald-500" },
    { title: "AI Queries", value: stats?.totalQueries || 0, icon: Activity, color: "text-purple-500" },
    { title: "Sent Emails", value: stats?.sentEmails || 0, icon: Shield, color: "text-rose-500" },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
            <Shield className="w-8 h-8 text-accent" /> Admin Panel
          </h1>
          <p className="text-muted-foreground mt-1">System overview and management console.</p>
        </div>
        <Button onClick={handleReindex} disabled={reindexMutation.isPending} variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground">
          {reindexMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Retrain / Re-index DB
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewStats.map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 bg-muted rounded-full ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="logs">System Activity</TabsTrigger>
        </TabsList>
        
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>Manage platform access and roles.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.id}</TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No users found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>System Activity Logs</CardTitle>
              <CardDescription>Audit trail of administrative actions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">{log.action}</TableCell>
                      <TableCell>{log.userId || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{log.details || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No logs found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
