import { useEffect, useRef, useState } from "react";
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
import { Mail, Send, CheckCircle2, Clock, XCircle, Loader2, Paperclip, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function encodeAttachment(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return {
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    contentBase64: btoa(binary),
  };
}

function getEmailErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string") return message;
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length < 500) return message;
  }
  return "Email could not be sent. Check the recipient and try again.";
}

export default function EmailPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: drafts = [],
    isLoading: draftsLoading,
    isFetching: draftsFetching,
  } = useListDrafts({ query: { queryKey: getListDraftsQueryKey() } });
  const { data: emails = [], isLoading: emailsLoading } = useListEmails({ query: { queryKey: getListEmailsQueryKey() } });
  const sendEmailMutation = useSendEmail();

  const [requestedDraftId] = useState<number | null>(() => {
    const rawId = new URLSearchParams(window.location.search).get("draftId");
    const parsedId = rawId ? Number(rawId) : NaN;
    return Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
  });
  const initialDraftApplied = useRef(false);
  const [recipient, setRecipient] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<number | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (draftsLoading || draftsFetching || initialDraftApplied.current || !requestedDraftId) return;
    initialDraftApplied.current = true;
    const draft = drafts.find((item) => item.id === requestedDraftId);
    if (!draft) {
      setFormError("That generated document could not be found in your account.");
      return;
    }
    setDraftId(draft.id);
    setSubject(`Legal Document: ${draft.title}`);
    setBody(draft.content);
    const url = new URL(window.location.href);
    url.searchParams.delete("draftId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [drafts, draftsFetching, draftsLoading, requestedDraftId]);

  const handleDraftSelect = (val: string) => {
    if (val === "none") {
      setDraftId(null);
      return;
    }
    const id = parseInt(val);
    setDraftId(id);
    const draft = drafts.find(d => d.id === id);
    if (draft) {
      if (!subject.trim()) setSubject(`Legal Document: ${draft.title}`);
      setBody(draft.content);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSuccessMessage("");

    const normalizedRecipient = recipient.trim();
    const normalizedSenderName = senderName.trim();
    const normalizedSenderEmail = senderEmail.trim();
    const normalizedSubject = subject.trim();
    const normalizedBody = body.trim();
    if (!EMAIL_PATTERN.test(normalizedRecipient)) {
      setFormError("Please enter a valid recipient email address.");
      return;
    }
    if (!normalizedSenderName || normalizedSenderName.length > 200) {
      setFormError("Please enter a valid sender name.");
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedSenderEmail)) {
      setFormError("Please enter a valid sender email address.");
      return;
    }
    if (!normalizedSubject) {
      setFormError("Please enter an email subject.");
      return;
    }
    if (!normalizedBody) {
      setFormError("Please enter a message.");
      return;
    }
    if (attachmentFile && attachmentFile.size > MAX_ATTACHMENT_BYTES) {
      setFormError("Attachments must be 5 MB or smaller.");
      return;
    }

    let encodedAttachment;
    try {
      if (attachmentFile) encodedAttachment = await encodeAttachment(attachmentFile);
    } catch {
      setFormError("The attachment could not be read. Please choose it again.");
      return;
    }

    sendEmailMutation.mutate(
      {
        data: {
          to: normalizedRecipient,
          sender_name: normalizedSenderName,
          sender_email: normalizedSenderEmail,
          subject: normalizedSubject,
          message: normalizedBody,
          ...(draftId !== null ? { document_id: draftId } : {}),
          ...(encodedAttachment ? { attachment: encodedAttachment } : {}),
        },
      },
      {
        onSuccess: (data) => {
          const successText = `Email sent successfully! Recipient: ${data.recipientEmail}.`;
          setSuccessMessage(successText);
          toast({
            title: "Email sent successfully!",
            description: `Recipient: ${data.recipientEmail}`,
          });
          setRecipient("");
          setSenderName("");
          setSenderEmail("");
          setSubject("");
          setBody("");
          setDraftId(null);
          setAttachmentFile(null);
          const fileInput = document.getElementById("email-attachment") as HTMLInputElement | null;
          if (fileInput) fileInput.value = "";
          queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
        },
        onError: (error) => {
          const message = getEmailErrorMessage(error);
          setFormError(message);
          queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
          toast({ title: "Email not sent", description: message, variant: "destructive" });
        }
      }
    );
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormError("");
    setSuccessMessage("");
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setAttachmentFile(null);
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "txt"].includes(extension || "")) {
      event.target.value = "";
      setAttachmentFile(null);
      setFormError("Only PDF, DOCX, or TXT attachments are allowed.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      event.target.value = "";
      setAttachmentFile(null);
      setFormError("Attachments must be 5 MB or smaller.");
      return;
    }
    setAttachmentFile(file);
  };

  const selectedDraft = drafts.find((draft) => draft.id === draftId);

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
        <h1 className="text-3xl font-serif font-bold text-foreground">Send Email</h1>
        <p className="text-muted-foreground">Send a message to any valid email address, with an optional generated PDF or document attachment.</p>
      </div>

      {successMessage && (
        <div role="status" className="flex items-center gap-3 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-foreground">{successMessage}</p>
        </div>
      )}
      {formError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Compose Email</CardTitle>
            <CardDescription>Emails are sent from the application’s configured sender address.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSend}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Generated Document (Optional)</Label>
                <Select value={draftId?.toString() || ""} onValueChange={handleDraftSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a saved legal document..." />
                  </SelectTrigger>
                  <SelectContent>
                    {drafts.map(draft => (
                      <SelectItem key={draft.id} value={draft.id.toString()}>{draft.title}</SelectItem>
                    ))}
                    <SelectItem value="none">No generated document</SelectItem>
                  </SelectContent>
                </Select>
                {selectedDraft && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {selectedDraft.title} will be attached as a PDF.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipient-email">To Email</Label>
                <Input 
                  id="recipient-email"
                  type="email" 
                  autoComplete="email"
                  value={recipient} 
                  onChange={(e) => { setRecipient(e.target.value); setFormError(""); }}
                  placeholder="lawyer@example.com" 
                  required 
                  maxLength={254}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sender-name">Sender Name</Label>
                <Input
                  id="sender-name"
                  value={senderName}
                  onChange={(e) => { setSenderName(e.target.value); setFormError(""); }}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sender-email">Sender Email</Label>
                <Input
                  id="sender-email"
                  type="email"
                  value={senderEmail}
                  onChange={(e) => { setSenderEmail(e.target.value); setFormError(""); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-attachment">Attachment (Optional)</Label>
                <Input
                  id="email-attachment"
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={handleAttachmentChange}
                  aria-describedby="email-attachment-help"
                />
                <p id="email-attachment-help" className="text-xs text-muted-foreground">
                  PDF, DOCX, or TXT only; maximum 5 MB. You can attach a file in addition to a generated PDF.
                </p>
                {attachmentFile && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" />
                    {attachmentFile.name} ({(attachmentFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-subject">Subject</Label>
                <Input 
                  id="email-subject"
                  value={subject} 
                  onChange={(e) => { setSubject(e.target.value); setFormError(""); }}
                  placeholder="Notice of..." 
                  required 
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-body">Message</Label>
                <Textarea 
                  id="email-body"
                  value={body} 
                  onChange={(e) => { setBody(e.target.value); setFormError(""); }}
                  className="min-h-[250px] font-serif text-sm" 
                  required 
                  maxLength={100000}
                />
              </div>

              <p className="text-xs text-muted-foreground bg-muted/40 rounded p-3">
                Emails are sent from the official AI Legal website email. The sender name and email you enter will be displayed inside the email. Generated documents are converted to PDF on the server.
              </p>
            </CardContent>
            <CardFooter className="border-t bg-muted/10 py-4 flex justify-end">
              <Button type="submit" disabled={sendEmailMutation.isPending}>
                {sendEmailMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                {sendEmailMutation.isPending ? "Sending email..." : "Send Email"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sent Communications</CardTitle>
              <CardDescription>Your private email history, including sender details and delivery status.</CardDescription>
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
                        {email.senderName && (
                          <p><span className="font-medium text-foreground">Sender:</span> {email.senderName} &lt;{email.senderEmail}&gt;</p>
                        )}
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
