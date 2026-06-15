import { useGetHistory, getGetHistoryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, MessageSquare, Edit3, Mail, Clock, Loader2 } from "lucide-react";

export default function HistoryPage() {
  const { data: history = [], isLoading } = useGetHistory({ query: { queryKey: getGetHistoryQueryKey() } });

  const getIcon = (type: string) => {
    switch(type) {
      case 'upload': return <FileText className="w-5 h-5 text-blue-500" />;
      case 'chat': return <MessageSquare className="w-5 h-5 text-purple-500" />;
      case 'extract': return <FileText className="w-5 h-5 text-amber-500" />;
      case 'generate': return <Edit3 className="w-5 h-5 text-emerald-500" />;
      case 'email': return <Mail className="w-5 h-5 text-rose-500" />;
      default: return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Activity History</h1>
        <p className="text-muted-foreground">A complete timeline of your actions within LegalGPT.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <Clock className="w-12 h-12 opacity-20 mx-auto mb-4" />
              <p>No activity history found.</p>
            </div>
          ) : (
            <div className="divide-y">
              {history.map((item) => (
                <div key={item.id} className="p-4 sm:p-6 hover:bg-muted/30 transition-colors flex gap-4">
                  <div className="mt-1 p-2 bg-muted rounded-full shrink-0">
                    {getIcon(item.type)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-base mb-1">{item.description}</p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="capitalize">{item.type}</span>
                      <span>•</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
