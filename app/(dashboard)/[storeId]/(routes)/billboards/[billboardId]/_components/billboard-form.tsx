"use client";

import type React from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import axios from "axios";
import toast from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";

import { Billboard } from "@prisma/client";
import { Trash, X, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { AleartModal } from "@/components/modals/alert-modal";

interface BillboardsFormProps {
  initialData: Billboard | null;
}

const formSchema = z.object({
  label: z.string().min(1, "Label is required"),
  imageUrl: z
    .string()
    .min(1, "Image URL is required")
    .url("Must be a valid URL"),
});

type BillboardsFormValues = z.infer<typeof formSchema>;

export const BillboardsForm: React.FC<BillboardsFormProps> = ({ initialData }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const params = useParams();
  const router = useRouter();

  const title = initialData ? "Edit billboard" : "Create billboard";
  const description = initialData ? "Edit a billboard" : "Add a new billboard";
  const toastMessage = initialData ? "Billboard updated" : "Billboard created";
  const action = initialData ? "Save changes" : "Create";

  const form = useForm<BillboardsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          label: initialData.label,
          imageUrl: initialData.imageUrl,
        }
      : {
          label: "",
          imageUrl: "",
        },
  });

  const imageUrl = form.watch("imageUrl");

  const onSubmit = async (data: BillboardsFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${params.storeId}/billboards/${params.billboardId}`, data);
      } else {
        await axios.post(`/api/${params.storeId}/billboards`, data);
      }
      toast.success(toastMessage);
      router.refresh();
      router.push(`/${params.storeId}/billboards`);
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/billboards/${params.billboardId}`);
      toast.success("Billboard deleted.");
      router.refresh();
      router.push(`/${params.storeId}/billboards`);
    } catch {
      toast.error("Make sure you removed all categories using this billboard first.");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const handleRemoveImage = () => {
    form.setValue("imageUrl", "", { shouldValidate: true });
  };

  return (
    <>
      <AleartModal isOpen={open} onClose={() => setOpen(false)} onConfirm={onDelete} loading={loading} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-y-4 sm:gap-y-0">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 md:hidden"
            onClick={() => router.push(`/${params.storeId}/billboards`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Heading title={title} description={description} />
        </div>
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            onClick={() => setOpen(true)}
            className="self-start sm:self-auto"
          >
            <Trash className="h-4 w-4 mr-2" />
            Delete
          </Button>
        )}
      </div>

      <Separator className="my-4" />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Label</FormLabel>
                <FormControl>
                  <Input disabled={loading} placeholder="Billboard Label" {...field} className="h-12 text-base" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Image URL (Bunny CDN)</FormLabel>
                <FormControl>
                  <Input
                    disabled={loading}
                    placeholder="https://cdn.example.b-cdn.net/banner.jpg"
                    {...field}
                    className="h-12 text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {imageUrl && (
            <div className="relative mt-4 w-full max-w-xs">
              <Image
                src={imageUrl}
                alt="Billboard Preview"
                width={500}
                height={200}
                className="rounded-md border"
              />
              <Button
                type="button"
                variant="ghost"
                className="absolute top-1 right-1"
                onClick={handleRemoveImage}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 md:relative md:border-0 md:p-0 md:bg-transparent flex justify-end gap-x-2 z-10">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => router.push(`/${params.storeId}/billboards`)}
              className="flex-1 md:flex-none"
            >
              Cancel
            </Button>
            <Button disabled={loading} type="submit" className="flex-1 md:flex-none">
              {loading ? "Loading..." : action}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
};
