import { useState } from "react";
import { 
  useGetAdminStats, 
  getGetAdminStatsQueryKey, 
  useListUsers, 
  getListUsersQueryKey, 
  useListAdminLogs, 
  getListAdminLogsQueryKey, 
  useReindexDocuments,
  customFetch
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, FileText, Database, Activity, RefreshCw, Loader2, Plus, Trash2, Search, BookOpen, Upload } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function AdminPage() {
  const { toast } = useToast();
  
  const { data: stats, isLoading: statsLoading } = useGetAdminStats({ query: { queryKey: getGetAdminStatsQueryKey() } });
  const { data: users = [], isLoading: usersLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const { data: logs = [], isLoading: logsLoading } = useListAdminLogs({ query: { queryKey: getListAdminLogsQueryKey() } });
  const reindexMutation = useReindexDocuments();

  // Dataset states
  const [datasets, setDatasets] = useState<any[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDataset, setNewDataset] = useState({
    datasetName: "",
    description: "",
    sourceType: "custom_dataset",
    jurisdiction: "India",
    legalDomain: "General Law",
    content: "",
    fileBase64: "",
    filename: ""
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchDatasets = async () => {
    setDatasetsLoading(true);
    try {
      const data: any = await customFetch("/api/datasets");
      setDatasets(data || []);
    } catch (err) {
      toast({ title: "Failed to load datasets", variant: "destructive" });
    } finally {
      setDatasetsLoading(false);
    }
  };

  const handleReindex = () => {
    reindexMutation.mutate(undefined, {
      onSuccess: () => toast({ title: "Re-indexing Started", description: "Vector database is being rebuilt." }),
      onError: () => toast({ title: "Action Failed", description: "Could not trigger re-index.", variant: "destructive" })
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = (event.target?.result as string).split(",")[1];
      setNewDataset(prev => ({
        ...prev,
        fileBase64: b64,
        filename: file.name
      }));
      toast({ title: "File selected", description: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDataset.datasetName.trim()) {
      toast({ title: "Name required", description: "Please enter a dataset name.", variant: "destructive" });
      return;
    }
    try {
      await customFetch("/api/datasets", {
        method: "POST",
        body: JSON.stringify(newDataset),
      });
      toast({ title: "Dataset Created", description: "Legal dataset has been indexed into ChromaDB." });
      setIsAddOpen(false);
      setNewDataset({
        datasetName: "",
        description: "",
        sourceType: "custom_dataset",
        jurisdiction: "India",
        legalDomain: "General Law",
        content: "",
        fileBase64: "",
        filename: ""
      });
      fetchDatasets();
    } catch (err: any) {
      toast({ title: "Error creating dataset", description: err?.message || "Failed", variant: "destructive" });
    }
  };

  const handleDeleteDataset = async (id: number) => {
    if (!confirm("Are you sure you want to delete this dataset and its vectors?")) return;
    try {
      await customFetch(`/api/datasets/${id}`, { method: "DELETE" });
      toast({ title: "Dataset deleted" });
      fetchDatasets();
    } catch (err) {
      toast({ title: "Failed to delete dataset", variant: "destructive" });
    }
  };

  const handleSearchKnowledgeBase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results: any = await customFetch(`/api/knowledge/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(results || []);
    } catch (err) {
      toast({ title: "Search failed", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
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
          <p className="text-muted-foreground mt-1">System overview, legal datasets, and management console.</p>
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

      <Tabs defaultValue="users" className="w-full" onValueChange={(val) => { if (val === "datasets") fetchDatasets(); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="datasets">Legal Knowledge Base</TabsTrigger>
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

        <TabsContent value="datasets">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Legal Datasets & Knowledge Base</h3>
                <p className="text-sm text-muted-foreground">Manage administrator-provided datasets (CSV, JSON, PDF, DOCX, TXT).</p>
              </div>

              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground">
                    <Plus className="w-4 h-4 mr-2" /> Add Legal Dataset
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Import / Add Legal Dataset</DialogTitle>
                    <DialogDescription>Add structured legal records or upload dataset files for multi-source RAG.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateDataset} className="space-y-4 py-2">
                    <div>
                      <label className="text-xs font-medium block mb-1">Dataset Name *</label>
                      <Input 
                        value={newDataset.datasetName} 
                        onChange={e => setNewDataset({...newDataset, datasetName: e.target.value})} 
                        placeholder="e.g. Indian Criminal Law Acts" 
                        required 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium block mb-1">Source Type</label>
                        <Select value={newDataset.sourceType} onValueChange={val => setNewDataset({...newDataset, sourceType: val})}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom_dataset">Custom Dataset</SelectItem>
                            <SelectItem value="legal_knowledge_base">Legal Knowledge Base</SelectItem>
                            <SelectItem value="external_dataset">External Dataset</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1">Domain</label>
                        <Input 
                          value={newDataset.legalDomain} 
                          onChange={e => setNewDataset({...newDataset, legalDomain: e.target.value})} 
                          placeholder="Criminal / Civil / Corporate" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Description</label>
                      <Input 
                        value={newDataset.description} 
                        onChange={e => setNewDataset({...newDataset, description: e.target.value})} 
                        placeholder="Brief overview of legal dataset" 
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Upload File (CSV, JSON, JSONL, PDF, DOCX, TXT)</label>
                      <Input type="file" onChange={handleFileUpload} accept=".csv,.json,.jsonl,.pdf,.docx,.txt" />
                      {newDataset.filename && (
                        <p className="text-xs text-emerald-600 mt-1 font-medium">Loaded: {newDataset.filename}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">Or Direct Text Content</label>
                      <Textarea 
                        value={newDataset.content} 
                        onChange={e => setNewDataset({...newDataset, content: e.target.value})} 
                        placeholder="Paste legal provisions, section text, or case notes..."
                        rows={3} 
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      Index & Save Dataset
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Active Datasets</CardTitle>
              </CardHeader>
              <CardContent>
                {datasetsLoading ? (
                  <div className="py-6 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dataset Name</TableHead>
                        <TableHead>Source Type</TableHead>
                        <TableHead>Legal Domain</TableHead>
                        <TableHead>Docs</TableHead>
                        <TableHead>Vector Chunks</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {datasets.map(ds => (
                        <TableRow key={ds.id}>
                          <TableCell className="font-medium">
                            {ds.datasetName}
                            <p className="text-xs text-muted-foreground">{ds.description || ds.datasetId}</p>
                          </TableCell>
                          <TableCell><Badge variant="outline">{ds.sourceType}</Badge></TableCell>
                          <TableCell>{ds.legalDomain}</TableCell>
                          <TableCell>{ds.documentCount}</TableCell>
                          <TableCell>{ds.chunkCount}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteDataset(ds.id)} className="text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {datasets.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No custom datasets uploaded yet.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="w-4 h-4 text-primary" /> Search Vector Knowledge Base
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSearchKnowledgeBase} className="flex gap-2">
                  <Input 
                    value={searchQuery} 
                    onChange={e => setSearchQuery(e.target.value)} 
                    placeholder="Enter query to test ChromaDB retrieval..." 
                  />
                  <Button type="submit" disabled={isSearching}>
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search Vectors"}
                  </Button>
                </form>

                {searchResults.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <p className="text-xs font-semibold text-muted-foreground">Top Vector Results ({searchResults.length}):</p>
                    {searchResults.map((res, i) => (
                      <div key={i} className="p-3 bg-muted/40 border rounded-md text-xs space-y-1">
                        <div className="flex justify-between text-foreground font-medium">
                          <span>{res.datasetName || "Knowledge Base"} — {res.documentTitle || "Record"}</span>
                          <span className="text-muted-foreground">{res.sourceType}</span>
                        </div>
                        <p className="text-muted-foreground line-clamp-3 whitespace-pre-wrap">{res.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
