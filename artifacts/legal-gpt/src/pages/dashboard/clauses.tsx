import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListDocuments, 
  getListDocumentsQueryKey,
  useExtractClauses,
  useListClauseExtractions,
  getListClauseExtractionsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileSearch, Download, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function ClausesPage() {
  const [documentId, setDocumentId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [] } = useListDocuments({ query: { queryKey: getListDocumentsQueryKey() } });
  const { data: extractions = [], isLoading: historyLoading } = useListClauseExtractions({ query: { queryKey: getListClauseExtractionsQueryKey() } });
  const extractMutation = useExtractClauses();

  const handleExtract = () => {
    if (!documentId) return;

    extractMutation.mutate(
      { data: { documentId } },
      {
        onSuccess: () => {
          toast({ title: "Extraction complete", description: "Clauses have been successfully extracted." });
          queryClient.invalidateQueries({ queryKey: getListClauseExtractionsQueryKey() });
        },
        onError: () => {
          toast({ title: "Extraction failed", description: "Could not extract clauses from the document.", variant: "destructive" });
        }
      }
    );
  };

  const processedDocs = documents.filter(d => d.status === 'processed');
  
  // Get extraction for currently selected document, or show latest
  const activeExtraction = documentId 
    ? extractions.find(e => e.documentId === documentId) 
    : extractions[0];

  const renderClauseCard = (title: string, content: any) => {
    if (!content) return null;
    
    return (
      <Card key={title} className="overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-medium text-sm text-foreground">{title}</h3>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <CardContent className="p-4 text-sm leading-relaxed">
          {typeof content === 'string' ? content : JSON.stringify(content)}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Clause Extractor</h1>
        <p className="text-muted-foreground">Automatically identify and extract key clauses from complex legal documents.</p>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-6 flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-primary mb-1">Select Document to Analyze</h3>
            <p className="text-sm text-muted-foreground">Choose a processed document to extract parties, dates, payment terms, and liability clauses.</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Select 
              value={documentId?.toString() || ""} 
              onValueChange={(val) => setDocumentId(parseInt(val))}
            >
              <SelectTrigger className="w-full md:w-[250px] bg-background">
                <SelectValue placeholder="Select a document..." />
              </SelectTrigger>
              <SelectContent>
                {processedDocs.map(doc => (
                  <SelectItem key={doc.id} value={doc.id.toString()}>
                    {doc.name}
                  </SelectItem>
                ))}
                {processedDocs.length === 0 && (
                  <SelectItem value="none" disabled>No processed documents</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button 
              onClick={handleExtract} 
              disabled={!documentId || extractMutation.isPending}
              className="shrink-0"
            >
              {extractMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileSearch className="w-4 h-4 mr-2" />}
              Extract
            </Button>
          </div>
        </CardContent>
      </Card>

      {historyLoading || extractMutation.isPending ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
          <p>Analyzing document structure and extracting key entities...</p>
        </div>
      ) : activeExtraction ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              Extraction Results
              <span className="text-sm font-normal text-muted-foreground ml-2">
                Doc ID: {activeExtraction.documentId}
              </span>
            </h2>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" /> Download Summary
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeExtraction.clauses && Object.entries(activeExtraction.clauses).map(([key, value]) => {
              // Format key from camelCase to Title Case
              const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
              return renderClauseCard(title, value);
            })}
            
            {/* Fallback if clauses is somehow stringified or malformed */}
            {(!activeExtraction.clauses || Object.keys(activeExtraction.clauses).length === 0) && (
               <Card className="col-span-full">
                 <CardContent className="p-6 text-center text-muted-foreground">
                   Raw output: {JSON.stringify(activeExtraction)}
                 </CardContent>
               </Card>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 border rounded-lg bg-muted/10 border-dashed">
          <FileSearch className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">No extraction selected</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Select a document above and click "Extract" to pull structured data points and clauses.
          </p>
        </div>
      )}
    </div>
  );
}
