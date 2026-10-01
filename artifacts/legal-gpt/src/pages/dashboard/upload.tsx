import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListDocuments, 
  getListDocumentsQueryKey,
  useUploadDocument,
  useDeleteDocument,
  Document
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, FileText, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { Link } from "wouter";

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

async function encodeFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function getUploadError(error: unknown): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string") return message;
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length < 500) return message;
  }
  return "There was an error uploading your document.";
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: documents = [], isLoading } = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      const extension = f.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "docx", "txt"].includes(extension || "")) {
        e.target.value = "";
        setFile(null);
        toast({ title: "Unsupported file", description: "Upload a PDF, DOCX, or TXT file.", variant: "destructive" });
        return;
      }
      if (f.size > MAX_DOCUMENT_BYTES) {
        e.target.value = "";
        setFile(null);
        toast({ title: "File too large", description: "Documents must be 50 MB or smaller.", variant: "destructive" });
        return;
      }
      setFile(f);
      if (!fileName) setFileName(f.name);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({ title: "No file selected", description: "Please select a file to upload.", variant: "destructive" });
      return;
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      toast({ title: "File too large", description: "Documents must be 50 MB or smaller.", variant: "destructive" });
      return;
    }

    setIsPreparing(true);
    let fileBase64: string;
    try {
      fileBase64 = await encodeFile(file);
    } catch {
      setIsPreparing(false);
      toast({ title: "Could not read file", description: "Please select the document again.", variant: "destructive" });
      return;
    }
    setIsPreparing(false);

    uploadMutation.mutate(
      { 
        data: { 
          name: fileName || file.name, 
          size: file.size, 
          type: file.type || "application/octet-stream",
          filename: file.name,
          fileBase64,
        } 
      },
      {
        onSuccess: () => {
          toast({ title: "Document uploaded", description: "Readable page text was extracted and indexed for AI analysis." });
          setFile(null);
          setFileName("");
          queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
          const fileInput = document.getElementById('document-upload') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        },
        onError: (error) => {
          toast({ title: "Upload failed", description: getUploadError(error), variant: "destructive" });
        }
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this document?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Document deleted", description: "The document has been removed." });
            queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
          },
          onError: () => {
            toast({ title: "Deletion failed", description: "Could not delete document.", variant: "destructive" });
          }
        }
      );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed': return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20">Processed</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="secondary" className="animate-pulse">Processing...</Badge>;
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Document Management</h1>
        <p className="text-muted-foreground">Upload and manage your legal documents for AI analysis.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Upload Document</CardTitle>
              <CardDescription>Upload PDF, DOCX, or TXT files for AI analysis.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                  <Input 
                    id="document-upload" 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={handleFileChange}
                  />
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UploadCloud className="w-8 h-8" />
                    <span className="font-medium text-sm">{file ? file.name : "Drag & drop or click to browse"}</span>
                    <span className="text-xs opacity-75">PDF, DOCX, TXT up to 50 MB</span>
                  </div>
                </div>

                {file && (
                  <div className="space-y-2">
                    <Label htmlFor="fileName">Document Name</Label>
                    <Input 
                      id="fileName" 
                      value={fileName} 
                      onChange={(e) => setFileName(e.target.value)} 
                      placeholder="Enter a descriptive name" 
                    />
                    {file && (
                      <p className="text-xs text-emerald-600">
                        ✓ Ready — readable text is extracted securely on the server
                      </p>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={!file || uploadMutation.isPending || isPreparing}>
                  {uploadMutation.isPending || isPreparing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                  {isPreparing ? "Preparing file..." : uploadMutation.isPending ? "Uploading..." : "Upload Document"}
                </Button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground">
                Scanned PDFs without selectable text need OCR before they can be analyzed.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Your Documents</CardTitle>
              <CardDescription>Documents available for AI chat analysis.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading documents...
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center p-12 border rounded-lg bg-muted/20 border-dashed">
                  <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">No documents yet</h3>
                  <p className="text-muted-foreground text-sm">Upload your first legal document to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {documents.map((doc: Document) => (
                    <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2 bg-primary/10 rounded text-primary shrink-0 mt-1">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-foreground truncate" title={doc.name}>{doc.name}</h4>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>{(doc.size / 1024 / 1024).toFixed(2)} MB</span>
                            <span>•</span>
                            <span>{new Date(doc.uploadDate).toLocaleDateString()}</span>
                            <span>•</span>
                            {getStatusBadge(doc.status)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {doc.status === 'processed' && (
                          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                            <Link href={`/dashboard/chat?docId=${doc.id}`}>
                              <MessageSquare className="w-3.5 h-3.5 mr-1" /> Chat
                            </Link>
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
