import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListDocuments, 
  getListDocumentsQueryKey,
  useGetChatHistory,
  getGetChatHistoryQueryKey,
  useSendChatMessage
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, Bot, User, Loader2, Sparkles, FileText, Info, Database, Layers } from "lucide-react";

export default function ChatPage() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialDocId = searchParams.get('docId') ? parseInt(searchParams.get('docId')!) : null;

  const [documentId, setDocumentId] = useState<number | null>(initialDocId);
  const [sourceSelector, setSourceSelector] = useState<string>("auto");
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [] } = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const { data: history = [], isLoading: historyLoading } = useGetChatHistory({ query: { queryKey: getGetChatHistoryQueryKey() } });
  const sendMutation = useSendChatMessage();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, sendMutation.isPending]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim()) return;

    if (sourceSelector === "uploaded" && !documentId) {
      toast({ title: "Select a document", description: "Please select a document context when using Uploaded Documents source.", variant: "destructive" });
      return;
    }

    const currentMessage = message;
    setMessage("");

    sendMutation.mutate(
      { data: { message: currentMessage, documentId, sourceSelector } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey() });
        },
        onError: () => {
          toast({ title: "Message failed", description: "Could not send message to AI.", variant: "destructive" });
          setMessage(currentMessage);
        }
      }
    );
  };

  const sendQuickPrompt = (prompt: string) => {
    setMessage(prompt);
    setTimeout(() => {
      sendMutation.mutate(
        { data: { message: prompt, documentId, sourceSelector } as any },
        {
          onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey() }),
          onError: () => toast({ title: "Message failed", description: "Could not send message to AI.", variant: "destructive" })
        }
      );
    }, 50);
  };

  const processedDocs = documents.filter(d => d.status === 'processed');

  // Filter history to show relevant conversation or all
  const filteredHistory = documentId
    ? history.filter(m => m.documentId === documentId || !m.documentId)
    : history;

  const quickPrompts = [
    "Summarize this document",
    "What are the key clauses and terms?",
    "Identify any potential legal risks",
    "Explain in simple plain language",
    "What is the applicable legal provision?"
  ];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col max-w-6xl mx-auto gap-4">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">AI Legal Assistant</h1>
        <p className="text-muted-foreground">Ask questions, query legal knowledge bases, and analyze your documents.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Sidebar / Source & Context Selection */}
        <div className="lg:w-80 flex flex-col gap-4">
          <Card className="flex-shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" /> Knowledge Source
              </CardTitle>
              <CardDescription>Select vector search target.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Source Selector</label>
                <Select value={sourceSelector} onValueChange={setSourceSelector}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Knowledge Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Smart RAG)</SelectItem>
                    <SelectItem value="uploaded">Uploaded Documents</SelectItem>
                    <SelectItem value="knowledge_base">Legal Knowledge Base</SelectItem>
                    <SelectItem value="custom_dataset">Custom Dataset</SelectItem>
                    <SelectItem value="all">All Sources</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Document Context (Optional)</label>
                <Select 
                  value={documentId?.toString() || "all_docs"} 
                  onValueChange={(val) => setDocumentId(val === "all_docs" ? null : parseInt(val))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All documents / None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_docs">General / All Documents</SelectItem>
                    {processedDocs.map(doc => (
                      <SelectItem key={doc.id} value={doc.id.toString()}>
                        {doc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" /> Quick Prompts
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-2">
                {quickPrompts.map((prompt, i) => (
                  <Button 
                    key={i} 
                    variant="outline" 
                    className="justify-start h-auto py-2.5 text-xs font-normal text-left whitespace-normal leading-tight hover:border-primary/50 hover:bg-primary/5"
                    onClick={() => sendQuickPrompt(prompt)}
                    disabled={sendMutation.isPending}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden border-primary/20 shadow-sm">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {historyLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-lg">How can I help you with legal analysis today?</h3>
                <p className="max-w-sm mt-2 text-sm">
                  {documentId
                    ? "Ask me anything about this document — summaries, clauses, risks, or citations."
                    : "Ask any legal question or select a document context from the sidebar to begin."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredHistory.map((msg, i) => (
                  <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent/20 text-accent-foreground border border-accent/30'
                    }`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                      <div className={`p-4 rounded-lg text-sm leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-tr-none' 
                          : 'bg-muted/50 border rounded-tl-none'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                      
                      {msg.sources && msg.role === 'assistant' && (
                        <div className="mt-2 p-2.5 bg-secondary/50 border rounded-md text-xs w-full">
                          <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                            <Info className="w-3.5 h-3.5" /> Source Context
                          </div>
                          <p className="text-muted-foreground line-clamp-2" title={msg.sources}>{msg.sources}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {sendMutation.isPending && (
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-accent/20 text-accent-foreground border border-accent/30 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 border rounded-tl-none flex items-center gap-2">
                      <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-.15s]"></span>
                      <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-.3s]"></span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          
          <div className="p-4 bg-background border-t">
            <form onSubmit={handleSend} className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask a legal question or query your documents..."
                disabled={sendMutation.isPending}
                className="flex-1"
              />
              <Button type="submit" disabled={!message.trim() || sendMutation.isPending}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
            <div className="text-center mt-2">
              <span className="text-[11px] text-muted-foreground">
                LegalGPT provides general legal information and document analysis for informational purposes. It does not replace advice from a qualified legal professional.
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
