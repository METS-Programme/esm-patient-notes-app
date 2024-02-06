import React, { useCallback, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import {
  Button,
  ButtonSet,
  Column,
  DatePicker,
  DatePickerInput,
  Form,
  FormGroup,
  Layer,
  MultiSelect,
  RadioButton,
  RadioButtonGroup,
  Row,
  Stack,
  TextArea,
} from "@carbon/react";
import { Add, Edit } from "@carbon/react/icons";
import {
  type UploadedFile,
  createErrorHandler,
  ExtensionSlot,
  showModal,
  showSnackbar,
  useConfig,
  useLayoutType,
  usePatient,
  useSession,
  createAttachment,
} from "@openmrs/esm-framework";
import { type DefaultWorkspaceProps } from "@openmrs/esm-patient-common-lib";
import type { ConfigObject } from "../config-schema";
import type { VisitNotePayload } from "../types";
import {
  extractDate,
  saveVisitNote,
  useConceptAnswers,
  useVisitNotes,
} from "./visit-notes.resource";
import styles from "./visit-notes-form.scss";
import { mutate } from "swr";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

const visitNoteFormSchema = z.object({
  noteDate: z.date(),
  clinicalNote: z.string().optional(),
  revievwOfBodySystems: z.array(z.string()).optional(),
  image: z.any(),
});

type VisitNotesFormData = z.infer<typeof visitNoteFormSchema>;

const VisitNotesForm: React.FC<DefaultWorkspaceProps> = ({
  closeWorkspace,
  patientUuid,
}) => {
  const { t } = useTranslation();
  const isTablet = useLayoutType() === "tablet";
  const session = useSession();
  const config = useConfig() as ConfigObject;
  const state = useMemo(() => ({ patientUuid }), [patientUuid]);
  const {
    clinicianEncounterRole,
    encounterNoteTextConceptUuid,
    encounterTypeUuid,
    formConceptUuid,
  } = config.visitNoteConfig;
  const [isHandlingSubmit, setIsHandlingSubmit] = useState(false);

  const { conceptAnswers } = useConceptAnswers(
    "dce0e02a-30ab-102d-86b0-7a5022ba4115"
  );
  const { patient } = usePatient(patientUuid);
  const dateOfBirth = useMemo(() => {
    return patient ? extractDate(patient.birthDate) : "";
  }, [patient]);
  const age = useMemo(() => {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }, [dateOfBirth]);

  const [rows, setRows] = useState<number>();

  const { control, handleSubmit, watch, setValue } =
    useForm<VisitNotesFormData>({
      mode: "onSubmit",
      resolver: zodResolver(visitNoteFormSchema),
      defaultValues: {
        noteDate: new Date(),
      },
    });

  const currentImage = watch("image");
  const { mutateVisitNotes } = useVisitNotes(patientUuid);
  const mutateAttachments = () =>
    mutate(
      (key) =>
        typeof key === "string" && key.startsWith(`/ws/rest/v1/attachment`)
    );
  const locationUuid = session?.sessionLocation?.uuid;
  const providerUuid = session?.currentProvider?.uuid;

  const showImageCaptureModal = useCallback(() => {
    const close = showModal("capture-photo-modal", {
      saveFile: (file: UploadedFile) => {
        setValue("image", file);
        close();
        return Promise.resolve();
      },
      closeModal: () => {
        close();
      },
      allowedExtensions: allowedImageTypes,
      multipleFiles: false,
      collectDescription: false,
    });
  }, [patientUuid]);

  const onSubmit = useCallback(
    (data: VisitNotesFormData) => {
      const { noteDate, clinicalNote } = data;
      setIsHandlingSubmit(true);

      const visitNotePayload: VisitNotePayload = {
        encounterDatetime: dayjs(noteDate).format(),
        form: formConceptUuid,
        patient: patientUuid,
        location: locationUuid,
        encounterProviders: [
          {
            encounterRole: clinicianEncounterRole,
            provider: providerUuid,
          },
        ],
        encounterType: encounterTypeUuid,
        obs: clinicalNote
          ? [
              {
                concept: { uuid: encounterNoteTextConceptUuid, display: "" },
                value: clinicalNote,
              },
            ]
          : [],
      };

      const abortController = new AbortController();
      saveVisitNote(abortController, visitNotePayload)
        .then(() => {
          if (data.image) {
            return createAttachment(patientUuid, data.image);
          }
        })
        .then(() => {
          mutateVisitNotes();
          if (data.image) {
            mutateAttachments();
          }
          closeWorkspace();

          showSnackbar({
            isLowContrast: true,
            subtitle: t(
              "visitNoteNowVisible",
              "It is now visible on the Encounters page"
            ),
            kind: "success",
            title: t("visitNoteSaved", "Visit note saved"),
          });
        })
        .catch((err) => {
          createErrorHandler();

          showSnackbar({
            title: t("visitNoteSaveError", "Error saving visit note"),
            kind: "error",
            isLowContrast: false,
            subtitle: err?.message,
          });
        })
        .finally(() => {
          setIsHandlingSubmit(false);
          abortController.abort();
        });
    },
    [
      formConceptUuid,
      patientUuid,
      locationUuid,
      clinicianEncounterRole,
      providerUuid,
      encounterTypeUuid,
      encounterNoteTextConceptUuid,
      mutateVisitNotes,
      closeWorkspace,
      t,
    ]
  );

  const onError = (errors) => console.error(errors);

  return (
    <Form className={styles.form} onSubmit={handleSubmit(onSubmit, onError)}>
      {isTablet && (
        <Row className={styles.headerGridRow}>
          <ExtensionSlot
            name="visit-form-header-slot"
            className={styles.dataGridRow}
            state={state}
          />
        </Row>
      )}
      <Stack className={styles.formContainer} gap={2}>
        {isTablet ? (
          <h2 className={styles.heading}>
            {t("addVisitNote", "Add a visit note")}
          </h2>
        ) : null}
        <Row className={styles.row}>
          <Column sm={1}>
            <span className={styles.columnLabel}>{t("date", "Date")}</span>
          </Column>
          <Column sm={3}>
            <Controller
              name="noteDate"
              control={control}
              render={({ field: { onChange, value } }) => (
                <ResponsiveWrapper isTablet={isTablet}>
                  <DatePicker
                    dateFormat="d/m/Y"
                    datePickerType="single"
                    maxDate={new Date().toISOString()}
                    value={value}
                    onChange={([date]) => onChange(date)}
                  >
                    <DatePickerInput
                      id="visitDateTimePicker"
                      labelText={t("visitDate", "Visit date")}
                      placeholder="dd/mm/yyyy"
                    />
                  </DatePicker>
                </ResponsiveWrapper>
              )}
            />
          </Column>
        </Row>
        <Row className={styles.row}>
          <Column sm={1}>
            <span className={styles.columnLabel}>
              {t("reviewBodySystems", "Review of Body Systems")}
            </span>
          </Column>
          <Column sm={3}>
            <div style={{ marginTop: "1.188rem" }}>
              <MultiSelect
                Label="Review Body Systems"
                id="reviewBodySystems"
                items={conceptAnswers}
                onChange={() => {
                  // Empty function
                }}
              />
            </div>
          </Column>
        </Row>
        {age < 5 && (
          <Row claasName={styles.row}>
            <Column sm={1}>
              <span className={styles.columnLabel}>
                {t("poorWeightGain", "Poor weight gain in the last one month")}
              </span>
            </Column>
            <Column sm={3}>
              <div style={{ marginBottom: "1.188rem" }}>
                <RadioButtonGroup
                  name="poor-weight-gain"
                  legendText="Choose option"
                >
                  <RadioButton
                    labelText="Yes"
                    value="poor-weight-gain-1"
                    id="poor-weight-gain-1"
                  ></RadioButton>
                  <RadioButton
                    labelText="No"
                    value="poor-weight-gain-2"
                    id="poor-weight-gain-2"
                  ></RadioButton>
                </RadioButtonGroup>
              </div>
            </Column>
          </Row>
        )}
        {age < 5 && (
          <Row className={styles.row}>
            <Column sm={1}>
              <span className={styles.columnLabel}>
                {t(
                  "contactWithAPersonWithChronicCough",
                  "Contact with a person with Pulmonary Tuberculosis or chronic cough"
                )}
              </span>
            </Column>
            <Column sm={3}>
              <div>
                <RadioButtonGroup
                  name="contact-with-person"
                  legendText="Choose option"
                >
                  <RadioButton
                    labelText="Yes"
                    value="contact-with-person-1"
                    id="contact-with-person-1"
                  ></RadioButton>
                  <RadioButton
                    labelText="No"
                    value="contact-with-person-2"
                    id="contact-with-person-2"
                  ></RadioButton>
                </RadioButtonGroup>
              </div>
            </Column>
          </Row>
        )}
        <Row className={styles.row}>
          <Column sm={1}>
            <span className={styles.columnLabel}>{t("note", "Note")}</span>
          </Column>
          <Column sm={3}>
            <Controller
              name="clinicalNote"
              control={control}
              render={({ field: { onChange, onBlur, value } }) => (
                <ResponsiveWrapper isTablet={isTablet}>
                  <TextArea
                    id="additionalNote"
                    rows={rows}
                    labelText={t("clinicalNoteLabel", "Write your notes")}
                    placeholder={t(
                      "clinicalNotePlaceholder",
                      "Write any notes here"
                    )}
                    value={value}
                    onBlur={onBlur}
                    onChange={(event) => {
                      onChange(event);
                      const textareaLineHeight = 24; // This is the default line height for Carbon's TextArea component
                      const newRows = Math.ceil(
                        event.target.scrollHeight / textareaLineHeight
                      );
                      setRows(newRows);
                    }}
                  />
                </ResponsiveWrapper>
              )}
            />
          </Column>
        </Row>
        <Row className={styles.row}>
          <Column sm={1}>
            <span className={styles.columnLabel}>{t("image", "Image")}</span>
          </Column>
          <Column sm={3}>
            <FormGroup>
              <p className={styles.imgUploadHelperText}>
                {t(
                  "imageUploadHelperText",
                  "Upload an image or use this device's camera to capture an image"
                )}
              </p>
              {currentImage?.base64Content ? (
                <Button
                  style={{ marginTop: "1rem" }}
                  kind={isTablet ? "ghost" : "tertiary"}
                  onClick={() => showImageCaptureModal()}
                  renderIcon={(props) => <Edit size={16} {...props} />}
                >
                  {t("changeImage", "Change image")}
                </Button>
              ) : (
                <Button
                  style={{ marginTop: "1rem" }}
                  kind={isTablet ? "ghost" : "tertiary"}
                  onClick={() => showImageCaptureModal()}
                  renderIcon={(props) => <Add size={16} {...props} />}
                >
                  {t("addImage", "Add image")}
                </Button>
              )}
              {currentImage?.base64Content &&
              currentImage?.fileType == "image" ? (
                <div className={styles.imgThumbnailContainer}>
                  <img
                    src={currentImage.base64Content}
                    className={styles.imgThumbnail}
                    alt="Thumb nail"
                  />
                </div>
              ) : null}
            </FormGroup>
          </Column>
        </Row>
      </Stack>
      <ButtonSet className={isTablet ? styles.tablet : styles.desktop}>
        <Button
          className={styles.button}
          kind="secondary"
          onClick={() => closeWorkspace()}
        >
          {t("discard", "Discard")}
        </Button>
        <Button
          className={styles.button}
          kind="primary"
          onClick={handleSubmit}
          disabled={isHandlingSubmit}
          type="submit"
        >
          {t("saveAndClose", "Save and close")}
        </Button>
      </ButtonSet>
    </Form>
  );
};

export default VisitNotesForm;

function ResponsiveWrapper({
  children,
  isTablet,
}: {
  children: React.ReactNode;
  isTablet: boolean;
}) {
  return isTablet ? <Layer>{children} </Layer> : <>{children}</>;
}
