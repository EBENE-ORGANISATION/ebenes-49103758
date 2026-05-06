export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      absences: {
        Row: {
          annee: number
          created_at: string
          date_debut: string
          date_fin: string
          employe_id: number
          id: number
          jours: number
          mois: number
          motif: string | null
          motif_rejet: string | null
          societe_id: string
          statut_validation: string | null
          type: string
          updated_at: string
        }
        Insert: {
          annee: number
          created_at?: string
          date_debut: string
          date_fin: string
          employe_id: number
          id?: number
          jours?: number
          mois: number
          motif?: string | null
          motif_rejet?: string | null
          societe_id: string
          statut_validation?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          annee?: number
          created_at?: string
          date_debut?: string
          date_fin?: string
          employe_id?: number
          id?: number
          jours?: number
          mois?: number
          motif?: string | null
          motif_rejet?: string | null
          societe_id?: string
          statut_validation?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      alertes_lues: {
        Row: {
          alerte_id: string
          created_at: string
          id: string
          societe_id: string
          user_id: string
        }
        Insert: {
          alerte_id: string
          created_at?: string
          id?: string
          societe_id: string
          user_id: string
        }
        Update: {
          alerte_id?: string
          created_at?: string
          id?: string
          societe_id?: string
          user_id?: string
        }
        Relationships: []
      }
      app_state: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      articles: {
        Row: {
          categorie_id: number | null
          created_at: string
          description: string | null
          designation: string
          emplacement: string | null
          fournisseur_id: number | null
          id: number
          prix_achat: number
          prix_vente: number
          reference: string
          seuil_alerte: number
          societe_id: string
          stock: number
          unite: string
          updated_at: string
        }
        Insert: {
          categorie_id?: number | null
          created_at?: string
          description?: string | null
          designation: string
          emplacement?: string | null
          fournisseur_id?: number | null
          id?: number
          prix_achat?: number
          prix_vente?: number
          reference: string
          seuil_alerte?: number
          societe_id: string
          stock?: number
          unite?: string
          updated_at?: string
        }
        Update: {
          categorie_id?: number | null
          created_at?: string
          description?: string | null
          designation?: string
          emplacement?: string | null
          fournisseur_id?: number | null
          id?: number
          prix_achat?: number
          prix_vente?: number
          reference?: string
          seuil_alerte?: number
          societe_id?: string
          stock?: number
          unite?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
          value_after: Json | null
          value_before: Json | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
          value_after?: Json | null
          value_before?: Json | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
          value_after?: Json | null
          value_before?: Json | null
        }
        Relationships: []
      }
      bulletins_paie: {
        Row: {
          amu_pat: number
          amu_sal: number
          annee: number
          brut: number
          cnss_pat: number
          cnss_sal: number
          cout_employeur: number
          created_at: string
          employe_id: number
          employe_nom: string
          employe_user_id: string | null
          hs_montant: number
          id: string
          indemnites: number
          irpp: number
          mois: number
          net_a_payer: number
          paid_at: string | null
          prime_anciennete: number
          primes_diverses: number
          retenues_diverses: number
          salaire_base: number
          societe_id: string
          statut: string
          sursalaire: number
          total_retenues: number
        }
        Insert: {
          amu_pat?: number
          amu_sal?: number
          annee: number
          brut?: number
          cnss_pat?: number
          cnss_sal?: number
          cout_employeur?: number
          created_at?: string
          employe_id: number
          employe_nom: string
          employe_user_id?: string | null
          hs_montant?: number
          id?: string
          indemnites?: number
          irpp?: number
          mois: number
          net_a_payer?: number
          paid_at?: string | null
          prime_anciennete?: number
          primes_diverses?: number
          retenues_diverses?: number
          salaire_base?: number
          societe_id: string
          statut?: string
          sursalaire?: number
          total_retenues?: number
        }
        Update: {
          amu_pat?: number
          amu_sal?: number
          annee?: number
          brut?: number
          cnss_pat?: number
          cnss_sal?: number
          cout_employeur?: number
          created_at?: string
          employe_id?: number
          employe_nom?: string
          employe_user_id?: string | null
          hs_montant?: number
          id?: string
          indemnites?: number
          irpp?: number
          mois?: number
          net_a_payer?: number
          paid_at?: string | null
          prime_anciennete?: number
          primes_diverses?: number
          retenues_diverses?: number
          salaire_base?: number
          societe_id?: string
          statut?: string
          sursalaire?: number
          total_retenues?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulletins_paie_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      categories_stock: {
        Row: {
          created_at: string
          id: number
          nom: string
          societe_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          nom: string
          societe_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          nom?: string
          societe_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_stock_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_service_grants: {
        Row: {
          created_at: string
          expires_at: string
          granted_at: string
          granted_by: string | null
          id: string
          level: string
          note: string | null
          service: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          level?: string
          note?: string | null
          service: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          level?: string
          note?: string | null
          service?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_postes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          niveau: string
          nom: string
          service_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          niveau: string
          nom: string
          service_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          niveau?: string
          nom?: string
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_postes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "custom_services"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_services: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          nom: string
          societe_id: string
          updated_at: string
          workflow_validation: boolean
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          nom: string
          societe_id: string
          updated_at?: string
          workflow_validation?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          nom?: string
          societe_id?: string
          updated_at?: string
          workflow_validation?: boolean
        }
        Relationships: []
      }
      device_otps: {
        Row: {
          code_hash: string
          created_at: string
          device_fp: string | null
          expires_at: string
          id: string
          used: boolean
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          device_fp?: string | null
          expires_at?: string
          id?: string
          used?: boolean
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          device_fp?: string | null
          expires_at?: string
          id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      devis: {
        Row: {
          activite: string | null
          annee: number
          avec_tva: boolean | null
          client: string
          created_at: string
          date: string
          date_validite: string | null
          facture_id: number | null
          id: number
          lignes: Json
          mois: number
          notes: string | null
          numero: string
          reduction: number | null
          societe_id: string
          statut: string
          total_ht: number
          total_ttc: number
          total_tva: number
          updated_at: string
        }
        Insert: {
          activite?: string | null
          annee: number
          avec_tva?: boolean | null
          client: string
          created_at?: string
          date: string
          date_validite?: string | null
          facture_id?: number | null
          id?: number
          lignes?: Json
          mois: number
          notes?: string | null
          numero: string
          reduction?: number | null
          societe_id: string
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          updated_at?: string
        }
        Update: {
          activite?: string | null
          annee?: number
          avec_tva?: boolean | null
          client?: string
          created_at?: string
          date?: string
          date_validite?: string | null
          facture_id?: number | null
          id?: number
          lignes?: Json
          mois?: number
          notes?: string | null
          numero?: string
          reduction?: number | null
          societe_id?: string
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devis_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employes: {
        Row: {
          adresse: string | null
          categorie: string | null
          cni: string | null
          created_at: string
          date_embauche: string | null
          date_fin_contrat: string | null
          date_naissance: string | null
          echelon: number | null
          email: string | null
          enfants: number
          id: number
          indemnite_fonction: number | null
          indemnite_logement: number | null
          indemnite_transport: number | null
          lieu_naissance: string | null
          matricule: string | null
          motif_rejet: string | null
          nationalite: string | null
          nom: string
          num_cnss: string | null
          poste: string
          qualification: string | null
          salaire: number
          sexe: string | null
          situation: string
          societe_id: string
          solde_conges: number | null
          statut_validation: string | null
          sursalaire: number | null
          telephone: string | null
          type_contrat: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          adresse?: string | null
          categorie?: string | null
          cni?: string | null
          created_at?: string
          date_embauche?: string | null
          date_fin_contrat?: string | null
          date_naissance?: string | null
          echelon?: number | null
          email?: string | null
          enfants?: number
          id?: number
          indemnite_fonction?: number | null
          indemnite_logement?: number | null
          indemnite_transport?: number | null
          lieu_naissance?: string | null
          matricule?: string | null
          motif_rejet?: string | null
          nationalite?: string | null
          nom: string
          num_cnss?: string | null
          poste?: string
          qualification?: string | null
          salaire?: number
          sexe?: string | null
          situation?: string
          societe_id: string
          solde_conges?: number | null
          statut_validation?: string | null
          sursalaire?: number | null
          telephone?: string | null
          type_contrat?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          adresse?: string | null
          categorie?: string | null
          cni?: string | null
          created_at?: string
          date_embauche?: string | null
          date_fin_contrat?: string | null
          date_naissance?: string | null
          echelon?: number | null
          email?: string | null
          enfants?: number
          id?: number
          indemnite_fonction?: number | null
          indemnite_logement?: number | null
          indemnite_transport?: number | null
          lieu_naissance?: string | null
          matricule?: string | null
          motif_rejet?: string | null
          nationalite?: string | null
          nom?: string
          num_cnss?: string | null
          poste?: string
          qualification?: string | null
          salaire?: number
          sexe?: string | null
          situation?: string
          societe_id?: string
          solde_conges?: number | null
          statut_validation?: string | null
          sursalaire?: number | null
          telephone?: string | null
          type_contrat?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employes_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      factures: {
        Row: {
          activite: string | null
          annee: number
          avec_tva: boolean | null
          client: string
          created_at: string
          date: string
          id: number
          lignes: Json
          mois: number
          motif_rejet: string | null
          numero: string
          reduction: number | null
          societe_id: string
          statut: string
          statut_validation: string | null
          total_ht: number
          total_ttc: number
          total_tva: number
          transaction_id: number | null
          updated_at: string
        }
        Insert: {
          activite?: string | null
          annee: number
          avec_tva?: boolean | null
          client: string
          created_at?: string
          date: string
          id?: number
          lignes?: Json
          mois: number
          motif_rejet?: string | null
          numero: string
          reduction?: number | null
          societe_id: string
          statut?: string
          statut_validation?: string | null
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          transaction_id?: number | null
          updated_at?: string
        }
        Update: {
          activite?: string | null
          annee?: number
          avec_tva?: boolean | null
          client?: string
          created_at?: string
          date?: string
          id?: number
          lignes?: Json
          mois?: number
          motif_rejet?: string | null
          numero?: string
          reduction?: number | null
          societe_id?: string
          statut?: string
          statut_validation?: string | null
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          transaction_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factures_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      fournisseurs: {
        Row: {
          adresse: string | null
          contact: string | null
          created_at: string
          email: string | null
          id: number
          nom: string
          societe_id: string
          telephone: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: number
          nom: string
          societe_id: string
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: number
          nom?: string
          societe_id?: string
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fournisseurs_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      heures_sup: {
        Row: {
          annee: number
          created_at: string
          dimanche_ferie: number | null
          employe_id: number
          id: number
          jour_semaine: number | null
          jour_sup: number | null
          mois: number
          motif_rejet: string | null
          nuit_dimanche_ferie: number | null
          nuit_semaine: number | null
          societe_id: string
          statut_validation: string | null
          updated_at: string
        }
        Insert: {
          annee: number
          created_at?: string
          dimanche_ferie?: number | null
          employe_id: number
          id?: number
          jour_semaine?: number | null
          jour_sup?: number | null
          mois: number
          motif_rejet?: string | null
          nuit_dimanche_ferie?: number | null
          nuit_semaine?: number | null
          societe_id: string
          statut_validation?: string | null
          updated_at?: string
        }
        Update: {
          annee?: number
          created_at?: string
          dimanche_ferie?: number | null
          employe_id?: number
          id?: number
          jour_semaine?: number | null
          jour_sup?: number | null
          mois?: number
          motif_rejet?: string | null
          nuit_dimanche_ferie?: number | null
          nuit_semaine?: number | null
          societe_id?: string
          statut_validation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "heures_sup_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      immobilisations: {
        Row: {
          categorie: string | null
          comptes_syscohada: Json
          created_at: string
          date_acquisition: string
          date_cession: string | null
          duree_amortissement: number
          id: number
          libelle: string
          methode: string
          notes: string | null
          societe_id: string
          updated_at: string
          valeur_origine: number
          valeur_residuelle: number | null
        }
        Insert: {
          categorie?: string | null
          comptes_syscohada?: Json
          created_at?: string
          date_acquisition: string
          date_cession?: string | null
          duree_amortissement?: number
          id?: number
          libelle: string
          methode?: string
          notes?: string | null
          societe_id: string
          updated_at?: string
          valeur_origine?: number
          valeur_residuelle?: number | null
        }
        Update: {
          categorie?: string | null
          comptes_syscohada?: Json
          created_at?: string
          date_acquisition?: string
          date_cession?: string | null
          duree_amortissement?: number
          id?: number
          libelle?: string
          methode?: string
          notes?: string | null
          societe_id?: string
          updated_at?: string
          valeur_origine?: number
          valeur_residuelle?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "immobilisations_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      mouvements_stock: {
        Row: {
          annee: number
          article_id: number
          created_at: string
          date: string
          facture_id: number | null
          id: number
          mois: number
          motif: string | null
          prix_unitaire: number | null
          quantite: number
          reference: string | null
          societe_id: string
          transaction_id: number | null
          type: string
          updated_at: string
        }
        Insert: {
          annee: number
          article_id: number
          created_at?: string
          date: string
          facture_id?: number | null
          id?: number
          mois: number
          motif?: string | null
          prix_unitaire?: number | null
          quantite: number
          reference?: string | null
          societe_id: string
          transaction_id?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          annee?: number
          article_id?: number
          created_at?: string
          date?: string
          facture_id?: number | null
          id?: number
          mois?: number
          motif?: string | null
          prix_unitaire?: number | null
          quantite?: number
          reference?: string | null
          societe_id?: string
          transaction_id?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mouvements_stock_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      params_annuels: {
        Row: {
          activite: string | null
          annee: number
          created_at: string
          id: number
          rsl: number | null
          societe_id: string
          th: number | null
          updated_at: string
        }
        Insert: {
          activite?: string | null
          annee: number
          created_at?: string
          id?: number
          rsl?: number | null
          societe_id: string
          th?: number | null
          updated_at?: string
        }
        Update: {
          activite?: string | null
          annee?: number
          created_at?: string
          id?: number
          rsl?: number | null
          societe_id?: string
          th?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "params_annuels_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_overrides: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          level: Database["public"]["Enums"]["access_level"]
          module: Database["public"]["Enums"]["app_module"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          level: Database["public"]["Enums"]["access_level"]
          module: Database["public"]["Enums"]["app_module"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          level?: Database["public"]["Enums"]["access_level"]
          module?: Database["public"]["Enums"]["app_module"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portail_messages: {
        Row: {
          auteur: string
          contenu: string
          created_at: string
          employe_user_id: string
          id: string
          lu: boolean
          societe_id: string
        }
        Insert: {
          auteur: string
          contenu: string
          created_at?: string
          employe_user_id: string
          id?: string
          lu?: boolean
          societe_id: string
        }
        Update: {
          auteur?: string
          contenu?: string
          created_at?: string
          employe_user_id?: string
          id?: string
          lu?: boolean
          societe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portail_messages_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      primes: {
        Row: {
          annee: number
          created_at: string
          employe_id: number
          id: number
          libelle: string
          mois: number
          montant: number
          motif_rejet: string | null
          societe_id: string
          statut_validation: string | null
          updated_at: string
        }
        Insert: {
          annee: number
          created_at?: string
          employe_id: number
          id?: number
          libelle?: string
          mois: number
          montant?: number
          motif_rejet?: string | null
          societe_id: string
          statut_validation?: string | null
          updated_at?: string
        }
        Update: {
          annee?: number
          created_at?: string
          employe_id?: number
          id?: number
          libelle?: string
          mois?: number
          montant?: number
          motif_rejet?: string | null
          societe_id?: string
          statut_validation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "primes_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          actif: boolean
          created_at: string
          email: string | null
          id: string
          nom: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nom?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nom?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      retenues: {
        Row: {
          annee: number
          created_at: string
          employe_id: number
          id: number
          mois: number
          montant: number
          societe_id: string
          updated_at: string
        }
        Insert: {
          annee: number
          created_at?: string
          employe_id: number
          id?: number
          mois: number
          montant?: number
          societe_id: string
          updated_at?: string
        }
        Update: {
          annee?: number
          created_at?: string
          employe_id?: number
          id?: number
          mois?: number
          montant?: number
          societe_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retenues_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctions: {
        Row: {
          created_at: string
          date: string
          employe_id: number
          id: number
          jours_mise_a_pied: number | null
          motif: string
          motif_rejet: string | null
          observations: string | null
          societe_id: string
          statut_validation: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          employe_id: number
          id?: number
          jours_mise_a_pied?: number | null
          motif?: string
          motif_rejet?: string | null
          observations?: string | null
          societe_id: string
          statut_validation?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          employe_id?: number
          id?: number
          jours_mise_a_pied?: number | null
          motif?: string
          motif_rejet?: string | null
          observations?: string | null
          societe_id?: string
          statut_validation?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sanctions_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      societe_config: {
        Row: {
          adresse: string | null
          compteur_devis: number
          compteur_facture: number
          couleur_accent: string | null
          couleur_primaire: string | null
          couleur_secondaire: string | null
          email: string | null
          format_devis: string
          format_facture: string
          logo_url: string | null
          mention_contrat: string | null
          mention_facture: string | null
          module_fiscalite: boolean
          module_grh: boolean
          module_ia: boolean
          module_immobilisations: boolean
          module_multi_societes: boolean
          module_stock: boolean
          nif: string | null
          police: string | null
          rccm: string | null
          site_web: string | null
          societe_id: string
          telephone: string | null
          theme_custom: Json
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          compteur_devis?: number
          compteur_facture?: number
          couleur_accent?: string | null
          couleur_primaire?: string | null
          couleur_secondaire?: string | null
          email?: string | null
          format_devis?: string
          format_facture?: string
          logo_url?: string | null
          mention_contrat?: string | null
          mention_facture?: string | null
          module_fiscalite?: boolean
          module_grh?: boolean
          module_ia?: boolean
          module_immobilisations?: boolean
          module_multi_societes?: boolean
          module_stock?: boolean
          nif?: string | null
          police?: string | null
          rccm?: string | null
          site_web?: string | null
          societe_id: string
          telephone?: string | null
          theme_custom?: Json
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          compteur_devis?: number
          compteur_facture?: number
          couleur_accent?: string | null
          couleur_primaire?: string | null
          couleur_secondaire?: string | null
          email?: string | null
          format_devis?: string
          format_facture?: string
          logo_url?: string | null
          mention_contrat?: string | null
          mention_facture?: string | null
          module_fiscalite?: boolean
          module_grh?: boolean
          module_ia?: boolean
          module_immobilisations?: boolean
          module_multi_societes?: boolean
          module_stock?: boolean
          nif?: string | null
          police?: string | null
          rccm?: string | null
          site_web?: string | null
          societe_id?: string
          telephone?: string | null
          theme_custom?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "societe_config_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: true
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      societes: {
        Row: {
          adresse: string
          couleur_primaire: string
          couleur_secondaire: string
          created_at: string
          created_by: string | null
          email: string
          fonction_representant: string
          id: string
          logo_url: string
          mention_legale_pied: string
          nif: string
          nom: string
          plan: string
          rccm: string
          representant: string
          site_web: string
          slogan: string
          slug: string | null
          statut: string
          telephone: string
          updated_at: string
        }
        Insert: {
          adresse?: string
          couleur_primaire?: string
          couleur_secondaire?: string
          created_at?: string
          created_by?: string | null
          email?: string
          fonction_representant?: string
          id?: string
          logo_url?: string
          mention_legale_pied?: string
          nif?: string
          nom: string
          plan?: string
          rccm?: string
          representant?: string
          site_web?: string
          slogan?: string
          slug?: string | null
          statut?: string
          telephone?: string
          updated_at?: string
        }
        Update: {
          adresse?: string
          couleur_primaire?: string
          couleur_secondaire?: string
          created_at?: string
          created_by?: string | null
          email?: string
          fonction_representant?: string
          id?: string
          logo_url?: string
          mention_legale_pied?: string
          nif?: string
          nom?: string
          plan?: string
          rccm?: string
          representant?: string
          site_web?: string
          slogan?: string
          slug?: string | null
          statut?: string
          telephone?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      taux_historique: {
        Row: {
          activite_defaut: string
          amu_emp: number
          amu_sal: number
          cnss_emp: number
          cnss_sal: number
          created_at: string
          date_effet: string
          id: number
          imf_min: number
          imf_taux: number
          is_taux: number
          patente_commerce: number
          patente_service: number
          societe_id: string
          tva: number
          updated_at: string
        }
        Insert: {
          activite_defaut?: string
          amu_emp?: number
          amu_sal?: number
          cnss_emp?: number
          cnss_sal?: number
          created_at?: string
          date_effet: string
          id?: number
          imf_min?: number
          imf_taux?: number
          is_taux?: number
          patente_commerce?: number
          patente_service?: number
          societe_id: string
          tva?: number
          updated_at?: string
        }
        Update: {
          activite_defaut?: string
          amu_emp?: number
          amu_sal?: number
          cnss_emp?: number
          cnss_sal?: number
          created_at?: string
          date_effet?: string
          id?: number
          imf_min?: number
          imf_taux?: number
          is_taux?: number
          patente_commerce?: number
          patente_service?: number
          societe_id?: string
          tva?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taux_historique_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          activite: string | null
          annee: number
          auto: boolean | null
          created_at: string
          date: string
          description: string
          facture_id: number | null
          fournisseur: string | null
          id: number
          mois: number
          montant: number
          motif_rejet: string | null
          piece_jointe: string | null
          piece_jointe_nom: string | null
          piece_jointe_type: string | null
          societe_id: string
          source: string
          statut: string | null
          type: string
          updated_at: string
        }
        Insert: {
          activite?: string | null
          annee: number
          auto?: boolean | null
          created_at?: string
          date: string
          description?: string
          facture_id?: number | null
          fournisseur?: string | null
          id?: number
          mois: number
          montant?: number
          motif_rejet?: string | null
          piece_jointe?: string | null
          piece_jointe_nom?: string | null
          piece_jointe_type?: string | null
          societe_id: string
          source?: string
          statut?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          activite?: string | null
          annee?: number
          auto?: boolean | null
          created_at?: string
          date?: string
          description?: string
          facture_id?: number | null
          fournisseur?: string | null
          id?: number
          mois?: number
          montant?: number
          motif_rejet?: string | null
          piece_jointe?: string | null
          piece_jointe_nom?: string | null
          piece_jointe_type?: string | null
          societe_id?: string
          source?: string
          statut?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_postes: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          poste_id: string
          societe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          poste_id: string
          societe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          poste_id?: string
          societe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_postes_poste_id_fkey"
            columns: ["poste_id"]
            isOneToOne: false
            referencedRelation: "custom_postes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feature_access: {
        Row: {
          created_at: string
          enabled: boolean
          feature: Database["public"]["Enums"]["header_feature"]
          granted_by: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature: Database["public"]["Enums"]["header_feature"]
          granted_by?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature?: Database["public"]["Enums"]["header_feature"]
          granted_by?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          service: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          service?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          service?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_societes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          societe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          societe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          societe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_societes_societe_id_fkey"
            columns: ["societe_id"]
            isOneToOne: false
            referencedRelation: "societes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_state_societe_id: { Args: { _key: string }; Returns: string }
      current_employe_id: { Args: { _user_id: string }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_active_chef_grant: {
        Args: { _service: string; _user_id: string }
        Returns: boolean
      }
      has_active_grant: {
        Args: { _service: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_societe_access: {
        Args: { _societe_id: string; _user_id: string }
        Returns: boolean
      }
      in_service_compta: { Args: { _user_id: string }; Returns: boolean }
      in_service_grh: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_general: { Args: { _user_id: string }; Returns: boolean }
      is_chef: { Args: { _user_id: string }; Returns: boolean }
      is_chef_compta: { Args: { _user_id: string }; Returns: boolean }
      is_chef_grh: { Args: { _user_id: string }; Returns: boolean }
      is_employe: { Args: { _user_id: string }; Returns: boolean }
      is_modele_societe: { Args: { _societe_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      access_level: "none" | "read" | "write" | "validate"
      app_module:
        | "dashboard"
        | "compta"
        | "factures"
        | "stock"
        | "immobilisations"
        | "fiscalite"
        | "parametres_sociaux"
        | "grh"
        | "outils_admin"
      app_role:
        | "admin"
        | "rh"
        | "comptable"
        | "saisie"
        | "chef_compta"
        | "membre_compta"
        | "chef_grh"
        | "membre_grh"
        | "dashboard_viewer"
        | "employe"
        | "admin_general"
      header_feature:
        | "alertes"
        | "recap_annuel"
        | "archives"
        | "json_io"
        | "users_admin"
        | "audit_log"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_level: ["none", "read", "write", "validate"],
      app_module: [
        "dashboard",
        "compta",
        "factures",
        "stock",
        "immobilisations",
        "fiscalite",
        "parametres_sociaux",
        "grh",
        "outils_admin",
      ],
      app_role: [
        "admin",
        "rh",
        "comptable",
        "saisie",
        "chef_compta",
        "membre_compta",
        "chef_grh",
        "membre_grh",
        "dashboard_viewer",
        "employe",
        "admin_general",
      ],
      header_feature: [
        "alertes",
        "recap_annuel",
        "archives",
        "json_io",
        "users_admin",
        "audit_log",
      ],
    },
  },
} as const
