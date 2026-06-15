import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useSendEmail,
  useListEmails,
  getListEmailsQueryKey,
  useListDrafts,
  getListDraftsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function EmailPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: drafts = [] } = useListDrafts({ query: { queryKey: getListDraftsQueryKey() } });
  const { data: emails = [], isLoading: emailsLoading } = useListEmails({ query: { queryKey: getListEmailsQueryKey() } });
  const sendEmailMutation = useSendEmail();

  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<number | null>(null);

  // Pre-fill email body when a draft is selected
  const handleDraftSelect = (val: string) => {
    const id = parseInt(val);
    setDraftId(id);
    const draft = drafts.find(d => d.id === id);
    if (draft) {
      if (!subject) setSubject(`Legal Document: ${draft.title}`);
      setBody(draft.content);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !subject || !body) return;

    sendEmailMutation.mutate(
      { data: { recipientEmail: recipient, subject, body, draftId } },
      {
        onSuccess: () => {
          toast({ title: "Email Sent", description: "Your formal letter has been sent successfully." });
          setRecipient("");
          setSubject("");
          setBody("");
          setDraftId(null);
          queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
        },
        onError: () => {
          toast({ title: "Failed to send", description: "An error occurred while sending the email.", variant: "destructive" });
        }
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent': return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1"/> Sent</Badge>;
      case 'failed': return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1"/> Failed</Badge>;
      case 'pending': return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1"/> Pending</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Send Formal Letters</h1>
        <p className="text-muted-foreground">Email your generated drafts or write custom letters directly to recipients.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Compose Email</CardTitle>
            <CardDescription>Send a legally sound communication.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSend}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Load from Draft (Optional)</Label>
                <Select value={draftId?.toString() || ""} onValueChange={handleDraftSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a saved draft..." />
                  </SelectTrigger>
                  <SelectContent>
                    {drafts.map(draft => (
                      <SelectItem key={draft.id} value={draft.id.toString()}>{draft.title}</SelectItem>
                    ))}
                    {drafts.length === 0 && <SelectItem value="none" disabled>No drafts available</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Recipient Email</Label>
                <Input 
                  type="email" 
                  value={recipient} 
                  onChange={(e) => setRecipient(e.target.value)} 
                  placeholder="lawyer@example.com" 
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Input 
                  value={subject} 
                  onChange={(e) => setSubject(e.target.value)} 
                  placeholder="Notice of..." 
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label>Message Body</Label>
                <Textarea 
                  value={body} 
                  onChange={(e) => setBody(e.target.value)} 
                  className="min-h-[250px] font-serif text-sm" 
                  required 
                />
              </div>
            </CardContent>
            <CardFooter className="border-t bg-muted/10 py-4 flex justify-between">
              <Button type="button" variant="outline">Preview</Button>
              <Button type="submit" disabled={sendEmailMutation.isPending}>
                {sendEmailMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Send Email
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sent Communications</CardTitle>
            <CardDescription>History of letters and emails sent through LegalGPT.</CardDescription>
          </CardHeader>
          <CardContent>
            {emailsLoading ? (
              <div className="p-8 text-center text-muted-foreground flex justify-center items-center">
                <Loader2 className="w-6 h-6 animate-spin mr-2"/> Loading history...
              </div>
            ) : emails.length === 0 ? (
              <div className="text-center p-12 border rounded-lg bg-muted/20 border-dashed">
                <Mail className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">No emails sent</h3>
                <p className="text-muted-foreground text-sm">Your sent communications will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {emails.map((email) => (
                  <div key={email.id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-foreground truncate mr-4">{email.subject}</h4>
                      {getStatusBadge(email.status)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><span className="font-medium text-foreground">To:</span> {email.recipientEmail}</p>
                      <p><span className="font-medium text-foreground">Sent:</span> {new Date(email.sentAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
